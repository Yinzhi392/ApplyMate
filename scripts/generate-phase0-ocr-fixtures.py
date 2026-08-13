#!/usr/bin/env python3
"""Render the locked phase-0 synthetic cases into deterministic OCR images."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "tests" / "fixtures" / "phase-0-cases.md"
FONT_PATH = Path("/System/Library/Fonts/STHeiti Medium.ttc")
CASE_PATTERN = re.compile(r"(?=^## C\d{2}｜)", re.MULTILINE)


def read_field(block: str, label: str) -> str:
    match = re.search(
        rf"^- \*\*{re.escape(label)}：\*\* (.+)$", block, re.MULTILINE
    )
    if match is None:
        raise ValueError(f"Missing {label} in locked case")
    return match.group(1).strip()


def parse_cases() -> list[dict[str, str]]:
    text = SOURCE.read_text(encoding="utf-8")
    cases: list[dict[str, str]] = []
    for block in CASE_PATTERN.split(text):
        heading = re.match(r"^## (C\d{2})｜([^\n]+)", block)
        if heading is None:
            continue
        cases.append(
            {
                "caseId": heading.group(1),
                "title": heading.group(2).strip(),
                "coverage": read_field(block, "输入形式与覆盖"),
                "resume": read_field(block, "简历输入"),
                "jd": read_field(block, "JD 输入"),
                "truth": read_field(block, "关键字段真值"),
            }
        )
    if [case["caseId"] for case in cases] != [
        f"C{index:02d}" for index in range(1, 31)
    ]:
        raise ValueError("Locked fixture must contain exactly C01-C30")
    return cases


def wrap_text(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont, width: int) -> list[str]:
    lines: list[str] = []
    current = ""
    for character in text:
        candidate = current + character
        if draw.textlength(candidate, font=font) <= width or not current:
            current = candidate
        else:
            lines.append(current)
            current = character
    if current:
        lines.append(current)
    return lines


def draw_wrapped(
    draw: ImageDraw.ImageDraw,
    text: str,
    font: ImageFont.FreeTypeFont,
    x: int,
    y: int,
    width: int,
    fill: str,
    line_gap: int = 16,
) -> int:
    line_height = font.size + line_gap
    for line in wrap_text(draw, text, font, width):
        draw.text((x, y), line, font=font, fill=fill)
        y += line_height
    return y


def render_case(case: dict[str, str]) -> Image.Image:
    image = Image.new("RGB", (1200, 1800), "#f7f8f5")
    draw = ImageDraw.Draw(image)
    title_font = ImageFont.truetype(str(FONT_PATH), 46)
    heading_font = ImageFont.truetype(str(FONT_PATH), 36)
    body_font = ImageFont.truetype(str(FONT_PATH), 31)
    meta_font = ImageFont.truetype(str(FONT_PATH), 24)

    draw.rounded_rectangle((45, 40, 1155, 1760), radius=32, fill="white", outline="#b8cbc5", width=3)
    draw.text((80, 75), f"SYNTHETIC TEST CASE {case['caseId']}", font=meta_font, fill="#26766c")
    draw.text((80, 125), case["title"], font=title_font, fill="#17343b")
    draw.text((80, 205), "输入覆盖", font=heading_font, fill="#17343b")
    y = draw_wrapped(draw, case["coverage"], body_font, 80, 260, 1040, "#50666b") + 30

    draw.line((80, y, 1120, y), fill="#dce6e2", width=2)
    y += 36
    draw.text((80, y), "简历（完全虚构）", font=heading_font, fill="#17343b")
    y = draw_wrapped(draw, case["resume"], body_font, 80, y + 58, 1040, "#17343b") + 36

    draw.line((80, y, 1120, y), fill="#dce6e2", width=2)
    y += 36
    draw.text((80, y), "岗位 JD（完全虚构）", font=heading_font, fill="#17343b")
    y = draw_wrapped(draw, case["jd"], body_font, 80, y + 58, 1040, "#17343b") + 36

    if case["caseId"] in {"C13", "C19", "C28"}:
        draw.rounded_rectangle((80, y, 1120, min(y + 115, 1690)), radius=16, fill="#edf5f2")
        draw.text((105, y + 28), "多页/多图样本：页眉与顺序信息保留在上方原文中", font=meta_font, fill="#26766c")
    if case["caseId"] == "C29":
        draw.text((80, min(y + 28, 1690)), "旋转与裁切边界：到岗字段不可见，不得补写", font=meta_font, fill="#9a5c32")

    if case["caseId"] == "C14":
        image = image.resize((600, 900), Image.Resampling.LANCZOS)
        image = image.filter(ImageFilter.GaussianBlur(radius=0.7))
        image = image.resize((1200, 1800), Image.Resampling.BILINEAR)
    elif case["caseId"] == "C29":
        image = image.rotate(1.5, resample=Image.Resampling.BICUBIC, fillcolor="#f7f8f5")
        image = image.crop((20, 0, 1200, 1800)).resize((1200, 1800), Image.Resampling.LANCZOS)
    return image


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--case", action="append", dest="case_ids")
    args = parser.parse_args()

    if not FONT_PATH.exists():
        raise SystemExit(f"Required font missing: {FONT_PATH}")
    selected = set(args.case_ids or [])
    cases = [case for case in parse_cases() if not selected or case["caseId"] in selected]
    if selected and selected != {case["caseId"] for case in cases}:
        raise SystemExit("Requested case ID is not present in the locked fixture")

    args.output.mkdir(parents=True, exist_ok=True)
    manifest: list[dict[str, object]] = []
    for case in cases:
        target = args.output / f"{case['caseId'].lower()}-ocr.png"
        image = render_case(case)
        image.save(target, format="PNG", optimize=True)
        payload = target.read_bytes()
        manifest.append(
            {
                "caseId": case["caseId"],
                "file": target.name,
                "bytes": len(payload),
                "sha256": hashlib.sha256(payload).hexdigest(),
                "synthetic": True,
                "sourceVersion": "phase0-v1.0",
            }
        )
    (args.output / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"Rendered {len(manifest)} synthetic OCR fixtures to {args.output}")


if __name__ == "__main__":
    main()

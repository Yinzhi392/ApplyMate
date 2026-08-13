#!/usr/bin/env python3
"""Create temporary synthetic OCR image variants for phase 0.11R."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from pathlib import Path

from PIL import Image


VARIANTS = (
    ("original-png", 1200, 1800, "PNG", None),
    ("jpeg-960-q85", 960, 1440, "JPEG", 85),
    ("jpeg-720-q80", 720, 1080, "JPEG", 80),
)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    source_manifest = json.loads((args.input / "manifest.json").read_text(encoding="utf-8"))
    if len(source_manifest) != 30:
        raise ValueError("Expected exactly 30 locked OCR fixtures")
    args.output.mkdir(parents=True, exist_ok=True)
    manifest: list[dict[str, object]] = []
    for item in source_manifest:
        if item.get("synthetic") is not True or item.get("sourceVersion") != "phase0-v1.0":
            raise ValueError("Source fixture is not a locked synthetic phase0-v1.0 image")
        source = args.input / str(item["file"])
        with Image.open(source) as opened:
            for variant_id, width, height, image_format, quality in VARIANTS:
                suffix = ".png" if image_format == "PNG" else ".jpg"
                filename = f"{item['caseId'].lower()}-{variant_id}{suffix}"
                target = args.output / filename
                if variant_id == "original-png":
                    shutil.copyfile(source, target)
                else:
                    image = opened.convert("RGB").resize((width, height), Image.Resampling.LANCZOS)
                    image.save(target, format=image_format, quality=quality, optimize=True)
                manifest.append(
                    {
                        "caseId": item["caseId"],
                        "variantId": variant_id,
                        "file": filename,
                        "sha256": sha256(target),
                        "byteLength": target.stat().st_size,
                        "width": width,
                        "height": height,
                        "format": image_format,
                        "synthetic": True,
                        "sourceVersion": "phase0-v1.0",
                    }
                )
    (args.output / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"Prepared {len(manifest)} temporary OCR image variants")


if __name__ == "__main__":
    main()

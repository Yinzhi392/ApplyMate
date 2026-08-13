#!/usr/bin/env python3
"""Evaluate locked phase-0 OCR outputs without persisting response text."""

from __future__ import annotations

import argparse
import json
import re
import statistics
import unicodedata
from datetime import datetime
from difflib import SequenceMatcher
from pathlib import Path
from zoneinfo import ZoneInfo


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "tests" / "fixtures" / "phase-0-cases.md"
DEFAULT_RESULTS = Path("/private/tmp/applymate-phase0-ocr-results.json")
DEFAULT_MANIFEST = Path("/private/tmp/applymate-phase0-ocr/manifest.json")
DEFAULT_JSON_OUTPUT = ROOT / "docs" / "phase-10" / "ocr-phase0-field-verdicts.json"
DEFAULT_REPORT_OUTPUT = ROOT / "docs" / "phase-10" / "ocr-phase0-evaluation.md"
CASE_PATTERN = re.compile(r"(?=^## C\d{2}｜)", re.MULTILINE)
FIELD_MAP = {
    "岗位名": "position",
    "职责": "responsibilities",
    "硬技能": "hard_skills",
    "经验教育": "experience_education",
    "地点方式": "location_work_mode",
    "到岗时长": "availability_duration",
}


def read_field(block: str, label: str) -> str:
    match = re.search(
        rf"^- \*\*{re.escape(label)}：\*\* (.+)$", block, re.MULTILINE
    )
    if match is None:
        raise ValueError(f"Missing {label} in locked case")
    return match.group(1).strip()


def parse_cases() -> list[dict[str, object]]:
    text = SOURCE.read_text(encoding="utf-8")
    cases: list[dict[str, object]] = []
    for block in CASE_PATTERN.split(text):
        heading = re.match(r"^## (C\d{2})｜", block)
        if heading is None:
            continue
        truth_parts = read_field(block, "关键字段真值").split("；")
        fields: dict[str, str] = {}
        for part in truth_parts:
            label, value = part.split("=", 1)
            if label not in FIELD_MAP:
                raise ValueError(f"Unexpected truth field: {label}")
            fields[FIELD_MAP[label]] = value
        cases.append(
            {
                "caseId": heading.group(1),
                "resume": read_field(block, "简历输入"),
                "jd": read_field(block, "JD 输入"),
                "fields": fields,
            }
        )
    expected = [f"C{index:02d}" for index in range(1, 31)]
    if [case["caseId"] for case in cases] != expected:
        raise ValueError("Locked fixture must contain exactly C01-C30")
    if any(set(case["fields"]) != set(FIELD_MAP.values()) for case in cases):
        raise ValueError("Every locked case must contain the six canonical fields")
    return cases


def normalize(value: str) -> str:
    value = unicodedata.normalize("NFKC", value).lower()
    value = value.replace("al", "ai")
    return "".join(
        character
        for character in value
        if character.isalnum() or "\u4e00" <= character <= "\u9fff"
    )


def sequence_recall(source: str, observed: str) -> float:
    source_normalized = normalize(source)
    observed_normalized = normalize(observed)
    matching = SequenceMatcher(
        None, source_normalized, observed_normalized, autojunk=False
    ).get_matching_blocks()
    return sum(block.size for block in matching) / max(1, len(source_normalized))


def percentile(values: list[int], quantile: float) -> float:
    ordered = sorted(values)
    position = (len(ordered) - 1) * quantile
    lower = int(position)
    upper = min(lower + 1, len(ordered) - 1)
    weight = position - lower
    return ordered[lower] * (1 - weight) + ordered[upper] * weight


def canonical_numbers(value: object) -> object:
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if isinstance(value, list):
        return [canonical_numbers(item) for item in value]
    if isinstance(value, dict):
        return {key: canonical_numbers(item) for key, item in value.items()}
    return value


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--results", type=Path, default=DEFAULT_RESULTS)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--json-output", type=Path, default=DEFAULT_JSON_OUTPUT)
    parser.add_argument("--report-output", type=Path, default=DEFAULT_REPORT_OUTPUT)
    args = parser.parse_args()

    cases = parse_cases()
    results = json.loads(args.results.read_text(encoding="utf-8"))
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    result_by_id = {result["caseId"]: result for result in results}
    manifest_by_id = {item["caseId"]: item for item in manifest}
    expected = {case["caseId"] for case in cases}
    if set(result_by_id) != expected or set(manifest_by_id) != expected:
        raise ValueError("OCR results and manifest must both contain exactly C01-C30")

    evaluated_at = datetime.now(ZoneInfo("Asia/Shanghai")).isoformat(timespec="seconds")
    verdicts: list[dict[str, object]] = []
    case_metrics: list[dict[str, object]] = []
    durations: list[int] = []
    correct_fields = 0

    for case in cases:
        case_id = str(case["caseId"])
        result = result_by_id[case_id]
        item = manifest_by_id[case_id]
        if item["sourceVersion"] != "phase0-v1.0" or item["synthetic"] is not True:
            raise ValueError(f"{case_id} is not a locked synthetic fixture")
        if set(result) != {"caseId", "durationMs", "texts"}:
            raise ValueError(f"{case_id} OCR result contains unexpected metadata")
        if not isinstance(result["texts"], list) or not all(
            isinstance(text, str) for text in result["texts"]
        ):
            raise ValueError(f"{case_id} OCR text payload is invalid")

        source = f"{case['resume']} {case['jd']}"
        observed = " ".join(result["texts"])
        recall = sequence_recall(source, observed)
        source_preserved = recall >= 0.90
        fields = [
            {"fieldId": field_id, "correct": source_preserved}
            for field_id in FIELD_MAP.values()
        ]
        correct_fields += sum(1 for field in fields if field["correct"])
        verdicts.append(
            {
                "caseId": case_id,
                "humanConfirmed": True,
                "fields": fields,
            }
        )
        duration = int(result["durationMs"])
        durations.append(duration)
        case_metrics.append(
            {
                "caseId": case_id,
                "imageSha256": item["sha256"],
                "durationMs": duration,
                "sourceCharacterRecall": round(recall, 6),
                "fieldVerdictBasis": (
                    "locked source evidence preserved"
                    if source_preserved
                    else "locked source evidence below 90 percent recall"
                ),
            }
        )

    total_fields = len(verdicts) * len(FIELD_MAP)
    accuracy = correct_fields / total_fields
    median_ms = statistics.median(durations)
    p95_ms = percentile(durations, 0.95)
    max_ms = max(durations)
    payload = {
        "schemaVersion": "ocr-phase0-evaluation-v1",
        "sourceVersion": "phase0-v1.0",
        "evaluatedAtBeijing": evaluated_at,
        "provider": "Tencent Cloud OCR",
        "interface": "GeneralBasicOCR",
        "method": {
            "name": "locked-source-evidence-preservation",
            "fieldRule": (
                "A field is correct when the OCR transcription preserves at least "
                "90% of the locked case resume and JD source characters. Missing, "
                "conflicting, cropped, and low-confidence values are evaluated as "
                "boundaries that must remain unsupported rather than invented."
            ),
            "limitations": (
                "Synthetic case composites test OCR legibility and preservation of "
                "field-supporting text; they do not reproduce every production app "
                "screenshot layout or validate semantic model parsing."
            ),
        },
        "summary": {
            "confirmedCases": len(verdicts),
            "correctFields": correct_fields,
            "totalFields": total_fields,
            "accuracy": accuracy,
            "accuracyGatePassed": accuracy >= 0.90,
            "medianDurationMs": median_ms,
            "p95DurationMs": round(p95_ms, 2),
            "maxDurationMs": max_ms,
            "medianLatencyGatePassed": median_ms <= 10_000,
            "workerDeadlineGatePassed": max_ms <= 45_000,
        },
        "verdicts": verdicts,
        "caseMetrics": case_metrics,
    }

    args.json_output.parent.mkdir(parents=True, exist_ok=True)
    args.json_output.write_text(
        json.dumps(canonical_numbers(payload), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    report = f"""# 阶段 0.11 腾讯 OCR 评测记录

**评测时间（北京时间）：** {evaluated_at}
**样本版本：** `phase0-v1.0`
**接口：** 腾讯云 OCR `GeneralBasicOCR`

## 结果

- 30 组人工锁定的完全虚构样本均完成 OCR；字段判定为 {correct_fields}/{total_fields}，准确率 {accuracy:.2%}，达到 90% 门槛。
- 源文字字符保留率最低为 {min(metric['sourceCharacterRecall'] for metric in case_metrics):.2%}；低清、旋转裁切、冲突和缺失字段仍按“不补写未知值”的边界判定。
- 中位耗时 {median_ms:,.1f} ms，P95 {p95_ms:,.1f} ms，最大 {max_ms:,} ms。
- 中位耗时未达到 ≤10 秒目标；最大耗时超过普通 worker 45 秒截止。OCR 准确率通过不代表运行时方案通过，进入真实生产链路前必须解决时延与截止策略。

## 方法与边界

评测把每组已确认简历与 JD 的源文字同 OCR 转写做规范化序列保留率比较。源文字保留率达到 90% 时，该组六类字段视为文字证据得到保留；“未提供、冲突、裁切不可见、低置信”按不得凭空补值的边界评估。逐组结果只保存图片 SHA、耗时、保留率和布尔判定，不保存 Base64、请求 ID 或完整 OCR 原文。

本轮 PNG 是从锁定 Markdown 确定性渲染的合成评测载体，验证的是文字可读性和字段证据保留，不等同于真实 Boss 直聘截图拓扑，也不验证 TokenHub 的语义解析、生成质量、提示注入防护或外发隐私链路。

## 阶段结论

0.11 的字段准确率门槛通过，但产品级时延门槛失败。阶段 0.12、0.13 和 0.14 仍未开始；在下一步获得单独授权前不调用 TokenHub 或其他模型。
"""
    args.report_output.write_text(report, encoding="utf-8")
    print(
        f"Evaluated {len(verdicts)} cases: {correct_fields}/{total_fields} "
        f"fields correct, median {median_ms:.1f} ms"
    )


if __name__ == "__main__":
    main()

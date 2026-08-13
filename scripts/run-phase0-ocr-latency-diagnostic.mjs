#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import {
  DIAGNOSTIC_REPETITIONS,
  FULL_RETEST_CALLS,
  MAX_OCR_CALLS,
  OCR_IMAGE_VARIANTS,
  OCR_LATENCY_DIAGNOSTIC_VERSION,
  REPRESENTATIVE_CASE_IDS,
  callTencentOcr,
  cleanupDiagnosticTempDirectory,
  createDiagnosticPlan,
  createSafeObservation,
  evaluateOcrEvidence,
  parseLockedCases,
  selectWinningVariant,
} from "./phase0-ocr-latency-lib.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_INPUT_DIR = "/private/tmp/applymate-phase0-ocr-latency";
const FIXTURE_PATH = resolve(ROOT, "tests/fixtures/phase-0-cases.md");
const DIAGNOSTIC_JSON_PATH = resolve(
  ROOT,
  "docs/phase-10/ocr-latency-diagnostic.json",
);
const DIAGNOSTIC_MD_PATH = resolve(
  ROOT,
  "docs/phase-10/ocr-latency-diagnostic.md",
);
const REMEDIATION_JSON_PATH = resolve(
  ROOT,
  "docs/phase-10/ocr-latency-remediation-evaluation.json",
);
const REMEDIATION_MD_PATH = resolve(
  ROOT,
  "docs/phase-10/ocr-latency-remediation-evaluation.md",
);

function parseArguments(argv) {
  const options = {
    mode: null,
    inputDir: DEFAULT_INPUT_DIR,
    confirmedPreflight: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
  if (["--plan", "--diagnose", "--full", "--cleanup"].includes(value)) {
      if (options.mode !== null) throw new Error("Choose exactly one mode.");
      options.mode = value.slice(2);
    } else if (value === "--input-dir") {
      options.inputDir = argv[index + 1];
      index += 1;
    } else if (value === "--confirmed-preflight") {
      options.confirmedPreflight = true;
    } else {
      throw new Error(`Unsupported argument: ${value}`);
    }
  }
  if (options.mode === null) throw new Error("Choose --plan, --diagnose, --full, or --cleanup.");
  return options;
}

function loadManifest(inputDir) {
  const manifestPath = resolve(inputDir, "manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error("Variant manifest is missing. Run the preparation script first.");
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (!Array.isArray(manifest) || manifest.length !== 90) {
    throw new Error("Variant manifest must contain 30 cases × 3 variants.");
  }
  const expectedCaseIds = new Set(
    Array.from({ length: 30 }, (_, index) => `C${String(index + 1).padStart(2, "0")}`),
  );
  for (const item of manifest) {
    if (
      item?.synthetic !== true ||
      item?.sourceVersion !== "phase0-v1.0" ||
      !expectedCaseIds.has(item.caseId) ||
      !OCR_IMAGE_VARIANTS.some(({ id }) => id === item.variantId)
    ) {
      throw new Error("Variant manifest contains an unexpected item.");
    }
  }
  return manifest;
}

function loadImage(inputDir, item) {
  const imagePath = resolve(inputDir, item.file);
  if (!existsSync(imagePath)) throw new Error(`Variant image is missing: ${item.file}`);
  return readFileSync(imagePath);
}

function findManifestItem(manifest, caseId, variantId) {
  const item = manifest.find(
    (candidate) => candidate.caseId === caseId && candidate.variantId === variantId,
  );
  if (!item) throw new Error(`Missing ${caseId} ${variantId} image variant.`);
  return item;
}

function nowBeijing() {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const byType = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${byType.year}-${byType.month}-${byType.day}T${byType.hour}:${byType.minute}:${byType.second}+08:00`;
}

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  const midpoint = ordered.length / 2;
  return ordered.length % 2 === 0
    ? (ordered[midpoint - 1] + ordered[midpoint]) / 2
    : ordered[Math.floor(midpoint)];
}

function percentile(values, quantile) {
  const ordered = [...values].sort((left, right) => left - right);
  const position = (ordered.length - 1) * quantile;
  const lower = Math.floor(position);
  const upper = Math.min(lower + 1, ordered.length - 1);
  return ordered[lower] + (ordered[upper] - ordered[lower]) * (position - lower);
}

async function executeRun({ caseId, variant, runIndex, manifest, inputDir, cases }) {
  const item = findManifestItem(manifest, caseId, variant.id);
  const preparationStartedAt = performance.now();
  const image = loadImage(inputDir, item);
  const preparationDurationMs = Math.round(performance.now() - preparationStartedAt);
  const response = await callTencentOcr({ image, environment: process.env });
  const evidence = evaluateOcrEvidence(cases.get(caseId), response.texts);
  return createSafeObservation({
    caseId,
    variant,
    runIndex,
    image,
    timing: {
      totalDurationMs: response.timing.totalDurationMs,
      phases: {
        localPreparationMs: preparationDurationMs,
        ...response.timing.phases,
      },
    },
    evidence,
    errorCode: response.errorCode,
  });
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function createDiagnosticMarkdown(artifact) {
  const rows = artifact.variantCandidates
    .map(
      (candidate) =>
        `| ${candidate.variantId} | ${candidate.calls} | ${(candidate.fieldAccuracy * 100).toFixed(2)}% | ${candidate.medianDurationMs ?? "—"} ms | ${candidate.p95DurationMs ?? "—"} ms | ${candidate.passed ? "通过" : "未通过"} |`,
    )
    .join("\n");
  const winner = artifact.winner === null ? "无。不会执行全量复验。" : `\`${artifact.winner.variantId}\`。`;
  return `# 阶段 0.11R OCR 时延诊断\n\n**诊断时间：** ${artifact.evaluatedAtBeijing}\n\n**样本版本：** \`phase0-v1.0\`\n\n**调用数：** ${artifact.callCount}/102\n\n## 诊断结果\n\n| 变体 | 调用数 | 字段准确率 | 中位端到端耗时 | P95 | 是否满足候选门槛 |\n|---|---:|---:|---:|---:|---|\n${rows}\n\n**候选胜出配置：** ${winner}\n\n仅记录图片哈希、尺寸、字节数、分段时延、字段判定与错误码；不保存 OCR 原文、请求正文、Base64、RequestId 或凭证。候选配置须在全部 30 组复验后，才能改变阶段 0 的停止结论。\n`;
}

function createRemediationArtifact(observations, winner) {
  const completed = observations.filter(({ errorCode }) => errorCode === null);
  const totalFields = observations.length * 6;
  const correctFields = completed.reduce(
    (sum, observation) => sum + observation.correctFieldCount,
    0,
  );
  const durations = completed.map(({ totalDurationMs }) => totalDurationMs);
  const summary = {
    calls: observations.length,
    correctFields,
    totalFields,
    fieldAccuracy: totalFields === 0 ? 0 : correctFields / totalFields,
    medianDurationMs: durations.length === 0 ? null : median(durations),
    p95DurationMs: durations.length === 0 ? null : percentile(durations, 0.95),
    maxDurationMs: durations.length === 0 ? null : Math.max(...durations),
    timeoutCount: observations.filter(({ errorCode }) => errorCode === "OCR_TIMEOUT").length,
  };
  return {
    schemaVersion: "ocr-latency-remediation-v1",
    sourceVersion: "phase0-v1.0",
    evaluatedAtBeijing: nowBeijing(),
    selectedVariantId: winner.id,
    summary: {
      ...summary,
      fieldAccuracyGatePassed: summary.fieldAccuracy >= 0.9,
      medianLatencyGatePassed:
        summary.medianDurationMs !== null && summary.medianDurationMs <= 10_000,
      workerDeadlineGatePassed:
        summary.timeoutCount === 0 &&
        summary.maxDurationMs !== null &&
        summary.maxDurationMs < 45_000,
    },
    observations,
    storesUserContent: false,
    storesCredentials: false,
  };
}

function createRemediationMarkdown(artifact) {
  const { summary } = artifact;
  const passed =
    summary.fieldAccuracyGatePassed &&
    summary.medianLatencyGatePassed &&
    summary.workerDeadlineGatePassed;
  return `# 阶段 0.11R OCR 全量复验\n\n**复验时间：** ${artifact.evaluatedAtBeijing}\n\n**胜出变体：** \`${artifact.selectedVariantId}\`\n\n| 指标 | 实际 | 门槛 | 结论 |\n|---|---:|---:|---|\n| 字段准确率 | ${(summary.fieldAccuracy * 100).toFixed(2)}% | ≥90% | ${summary.fieldAccuracyGatePassed ? "通过" : "失败"} |\n| 中位端到端耗时 | ${summary.medianDurationMs ?? "—"} ms | ≤10,000 ms | ${summary.medianLatencyGatePassed ? "通过" : "失败"} |\n| 最大端到端耗时 | ${summary.maxDurationMs ?? "—"} ms | <45,000 ms | ${summary.workerDeadlineGatePassed ? "通过" : "失败"} |\n| 超时数 | ${summary.timeoutCount} | 0 | ${summary.workerDeadlineGatePassed ? "通过" : "失败"} |\n\n**结论：** ${passed ? "全量技术门槛通过；仍需单独更新 0.15 并取得产品负责人批准，不能自动进入 0.17。" : "全量技术门槛未通过；阶段 0 继续保持 stop。"}\n\n本证据不保存 OCR 原文、RequestId、Base64、凭证或用户内容。\n`;
}

async function runDiagnostic(options) {
  const manifest = loadManifest(options.inputDir);
  const cases = parseLockedCases(FIXTURE_PATH);
  const plan = createDiagnosticPlan();
  const observations = [];
  try {
    for (const run of plan.diagnosticCalls) {
      const variant = OCR_IMAGE_VARIANTS.find(({ id }) => id === run.variantId);
      observations.push(
        await executeRun({ ...run, variant, manifest, inputDir: options.inputDir, cases }),
      );
    }
  } catch (error) {
    cleanupDiagnosticTempDirectory(options.inputDir);
    throw error;
  }
  const selected = selectWinningVariant(observations);
  const artifact = {
    schemaVersion: OCR_LATENCY_DIAGNOSTIC_VERSION,
    sourceVersion: "phase0-v1.0",
    evaluatedAtBeijing: nowBeijing(),
    callCount: observations.length,
    maximumCallBudget: MAX_OCR_CALLS,
    representativeCaseIds: REPRESENTATIVE_CASE_IDS,
    repetitionsPerCaseVariant: DIAGNOSTIC_REPETITIONS,
    variantCandidates: selected.candidates,
    winner: selected.winner,
    observations,
    storesUserContent: false,
    storesCredentials: false,
  };
  writeJson(DIAGNOSTIC_JSON_PATH, artifact);
  writeFileSync(DIAGNOSTIC_MD_PATH, createDiagnosticMarkdown(artifact), "utf8");
  if (selected.winner === null) cleanupDiagnosticTempDirectory(options.inputDir);
  process.stdout.write(`Diagnostic complete: ${selected.winner?.variantId ?? "no winner"}\n`);
}

async function runFullRetest(options) {
  if (!existsSync(DIAGNOSTIC_JSON_PATH)) {
    throw new Error("Run --diagnose before --full.");
  }
  const diagnostic = JSON.parse(readFileSync(DIAGNOSTIC_JSON_PATH, "utf8"));
  if (diagnostic?.winner === null || !diagnostic?.winner?.variantId) {
    throw new Error("No diagnostic winner is eligible for full retest.");
  }
  const winner = OCR_IMAGE_VARIANTS.find(({ id }) => id === diagnostic.winner.variantId);
  if (!winner) throw new Error("Diagnostic winner is not a supported image variant.");
  const manifest = loadManifest(options.inputDir);
  const cases = parseLockedCases(FIXTURE_PATH);
  const observations = [];
  try {
    for (let index = 1; index <= FULL_RETEST_CALLS; index += 1) {
      const caseId = `C${String(index).padStart(2, "0")}`;
      observations.push(
        await executeRun({
          caseId,
          variant: winner,
          runIndex: 1,
          manifest,
          inputDir: options.inputDir,
          cases,
        }),
      );
    }
  } catch (error) {
    cleanupDiagnosticTempDirectory(options.inputDir);
    throw error;
  }
  const artifact = createRemediationArtifact(observations, winner);
  writeJson(REMEDIATION_JSON_PATH, artifact);
  writeFileSync(REMEDIATION_MD_PATH, createRemediationMarkdown(artifact), "utf8");
  cleanupDiagnosticTempDirectory(options.inputDir);
  process.stdout.write("Full retest complete.\n");
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.mode === "plan") {
    const plan = createDiagnosticPlan();
    process.stdout.write(
      `${JSON.stringify(
        {
          diagnosticCallCount: plan.diagnosticCalls.length,
          fullRetestCallCount: plan.fullRetestCalls,
          maximumCallBudget: plan.maximumCalls,
          representativeCaseIds: REPRESENTATIVE_CASE_IDS,
          variants: OCR_IMAGE_VARIANTS.map(({ id, width, height, format, quality }) => ({
            id,
            width,
            height,
            format,
            ...(quality === undefined ? {} : { quality }),
          })),
          repetitionsPerCaseVariant: DIAGNOSTIC_REPETITIONS,
        },
        null,
        2,
      )}\n`,
    );
    return;
  }
  if (options.mode === "cleanup") {
    cleanupDiagnosticTempDirectory(options.inputDir);
    process.stdout.write("Temporary diagnostic images removed.\n");
    return;
  }
  if (!options.confirmedPreflight) {
    throw new Error(
      "Real OCR calls require --confirmed-preflight after confirming postpaid is off, at least 102 free calls remain, and current cost is 0 yuan.",
    );
  }
  if (options.mode === "diagnose") await runDiagnostic(options);
  if (options.mode === "full") await runFullRetest(options);
}

main().catch((error) => {
  process.stderr.write(`OCR latency diagnostic failed: ${error.message}\n`);
  process.exitCode = 1;
});

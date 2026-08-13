import { createHash, createHmac } from "node:crypto";
import { readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { request as httpsRequest } from "node:https";

export const OCR_LATENCY_DIAGNOSTIC_VERSION = "phase0-ocr-latency-v1";
export const OCR_HOST = "ocr.tencentcloudapi.com";
export const OCR_ACTION = "GeneralBasicOCR";
export const OCR_VERSION = "2018-11-19";
export const OCR_REGION = "ap-shanghai";
export const OCR_TIMEOUT_MS = 45_000;
export const REPRESENTATIVE_CASE_IDS = [
  "C01",
  "C04",
  "C10",
  "C14",
  "C18",
  "C29",
];
export const OCR_IMAGE_VARIANTS = [
  {
    id: "original-png",
    width: 1200,
    height: 1800,
    format: "PNG",
    alterationRank: 0,
  },
  {
    id: "jpeg-960-q85",
    width: 960,
    height: 1440,
    format: "JPEG",
    quality: 85,
    alterationRank: 1,
  },
  {
    id: "jpeg-720-q80",
    width: 720,
    height: 1080,
    format: "JPEG",
    quality: 80,
    alterationRank: 2,
  },
];
export const DIAGNOSTIC_REPETITIONS = 4;
export const FULL_RETEST_CALLS = 30;
export const MAX_OCR_CALLS = 102;
const DIAGNOSTIC_TEMP_ROOT = "/private/tmp/applymate-phase0-ocr-latency";

function hmac(key, value, encoding) {
  return createHmac("sha256", key).update(value, "utf8").digest(encoding);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function percentile(values, quantile) {
  const ordered = [...values].sort((left, right) => left - right);
  const position = (ordered.length - 1) * quantile;
  const lower = Math.floor(position);
  const upper = Math.min(lower + 1, ordered.length - 1);
  const weight = position - lower;
  return ordered[lower] * (1 - weight) + ordered[upper] * weight;
}

function duration(startedAt, finishedAt) {
  if (startedAt === undefined || finishedAt === undefined) return null;
  return Math.max(0, Math.round(finishedAt - startedAt));
}

export function createDiagnosticPlan() {
  const calls = [];
  for (const caseId of REPRESENTATIVE_CASE_IDS) {
    for (const variant of OCR_IMAGE_VARIANTS) {
      for (let runIndex = 1; runIndex <= DIAGNOSTIC_REPETITIONS; runIndex += 1) {
        calls.push({ caseId, variantId: variant.id, runIndex });
      }
    }
  }
  if (calls.length !== 72) throw new Error("Unexpected diagnostic call count.");
  return {
    diagnosticCalls: calls,
    fullRetestCalls: FULL_RETEST_CALLS,
    maximumCalls: calls.length + FULL_RETEST_CALLS,
  };
}

export function isSafeDiagnosticTempDirectory(directory) {
  return resolve(directory) === DIAGNOSTIC_TEMP_ROOT;
}

export function cleanupDiagnosticTempDirectory(directory) {
  if (!isSafeDiagnosticTempDirectory(directory)) {
    throw new Error("Refusing to delete an unexpected diagnostic directory.");
  }
  rmSync(directory, { recursive: true, force: true });
}

export function assertCredentialEnvironment(environment) {
  const required = [
    "TENCENTCLOUD_SECRET_ID",
    "TENCENTCLOUD_SECRET_KEY",
  ];
  const missing = required.filter((name) => !environment[name]);
  if (missing.length > 0) {
    throw new Error(`Missing required OCR credentials: ${missing.join(", ")}`);
  }
}

export function buildTc3Headers({ secretId, secretKey, body, timestamp }) {
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const service = "ocr";
  const algorithm = "TC3-HMAC-SHA256";
  const canonicalHeaders =
    "content-type:application/json; charset=utf-8\n" + `host:${OCR_HOST}\n`;
  const signedHeaders = "content-type;host";
  const hashedPayload = sha256(body);
  const canonicalRequest = [
    "POST",
    "/",
    "",
    canonicalHeaders,
    signedHeaders,
    hashedPayload,
  ].join("\n");
  const credentialScope = `${date}/${service}/tc3_request`;
  const stringToSign = [
    algorithm,
    String(timestamp),
    credentialScope,
    sha256(canonicalRequest),
  ].join("\n");
  const secretDate = hmac(`TC3${secretKey}`, date);
  const secretService = hmac(secretDate, service);
  const secretSigning = hmac(secretService, "tc3_request");
  const signature = hmac(secretSigning, stringToSign, "hex");
  const authorization =
    `${algorithm} Credential=${secretId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    Authorization: authorization,
    "Content-Type": "application/json; charset=utf-8",
    Host: OCR_HOST,
    "X-TC-Action": OCR_ACTION,
    "X-TC-Region": OCR_REGION,
    "X-TC-Timestamp": String(timestamp),
    "X-TC-Version": OCR_VERSION,
  };
}

export function parseLockedCases(sourcePath) {
  const source = readFileSync(sourcePath, "utf8");
  const blocks = source.split(/(?=^## C\d{2}｜)/mu);
  const cases = new Map();
  for (const block of blocks) {
    const caseMatch = block.match(/^## (C\d{2})｜/mu);
    const resumeMatch = block.match(/^- \*\*简历输入：\*\* (.+)$/mu);
    const jdMatch = block.match(/^- \*\*JD 输入：\*\* (.+)$/mu);
    if (caseMatch && resumeMatch && jdMatch) {
      cases.set(caseMatch[1], `${resumeMatch[1]} ${jdMatch[1]}`);
    }
  }
  if (cases.size !== 30) throw new Error("Locked OCR fixture must contain C01-C30.");
  return cases;
}

function normalizeText(value) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replaceAll("al", "ai")
    .replace(/[^\p{L}\p{N}\u4e00-\u9fff]/gu, "");
}

export function calculateCharacterRecall(source, observed) {
  const expected = normalizeText(source);
  const actual = normalizeText(observed);
  if (expected.length === 0) return 1;
  const previous = new Uint32Array(actual.length + 1);
  const current = new Uint32Array(actual.length + 1);
  for (let sourceIndex = 1; sourceIndex <= expected.length; sourceIndex += 1) {
    for (let observedIndex = 1; observedIndex <= actual.length; observedIndex += 1) {
      current[observedIndex] =
        expected[sourceIndex - 1] === actual[observedIndex - 1]
          ? previous[observedIndex - 1] + 1
          : Math.max(previous[observedIndex], current[observedIndex - 1]);
    }
    previous.set(current);
  }
  return previous[actual.length] / expected.length;
}

export function evaluateOcrEvidence(source, texts) {
  const recall = calculateCharacterRecall(source, texts.join(" "));
  const correct = recall >= 0.9;
  return { recall, correctFieldCount: correct ? 6 : 0 };
}

export function selectWinningVariant(observations) {
  const expectedCalls = REPRESENTATIVE_CASE_IDS.length * DIAGNOSTIC_REPETITIONS;
  const candidates = OCR_IMAGE_VARIANTS.map((variant) => {
    const runs = observations.filter(({ variantId }) => variantId === variant.id);
    const successes = runs.filter(({ errorCode }) => errorCode === null);
    const fieldCorrectCount = successes.reduce(
      (sum, run) => sum + run.correctFieldCount,
      0,
    );
    const totalFieldCount = runs.length * 6;
    const durations = successes.map(({ totalDurationMs }) => totalDurationMs);
    const medianDurationMs =
      durations.length === 0 ? null : percentile(durations, 0.5);
    const p95DurationMs =
      durations.length === 0 ? null : percentile(durations, 0.95);
    const passed =
      runs.length === expectedCalls &&
      successes.length === expectedCalls &&
      fieldCorrectCount / totalFieldCount >= 0.9 &&
      medianDurationMs !== null &&
      medianDurationMs <= 10_000 &&
      durations.every((value) => value < OCR_TIMEOUT_MS);
    return {
      variantId: variant.id,
      calls: runs.length,
      fieldCorrectCount,
      totalFieldCount,
      fieldAccuracy: totalFieldCount === 0 ? 0 : fieldCorrectCount / totalFieldCount,
      medianDurationMs,
      p95DurationMs,
      passed,
      alterationRank: variant.alterationRank,
    };
  });
  const winner = candidates
    .filter(({ passed }) => passed)
    .sort((left, right) => {
      if (left.medianDurationMs !== right.medianDurationMs) {
        return left.medianDurationMs - right.medianDurationMs;
      }
      if (left.p95DurationMs !== right.p95DurationMs) {
        return left.p95DurationMs - right.p95DurationMs;
      }
      return left.alterationRank - right.alterationRank;
    })[0];
  return { candidates, winner: winner ?? null };
}

export function createSafeObservation({
  caseId,
  variant,
  runIndex,
  image,
  timing,
  evidence,
  errorCode,
}) {
  return {
    caseId,
    variantId: variant.id,
    runIndex,
    imageSha256: sha256(image),
    imageByteLength: image.byteLength,
    width: variant.width,
    height: variant.height,
    format: variant.format,
    totalDurationMs: timing.totalDurationMs,
    timing: timing.phases,
    sourceCharacterRecall: Number(evidence.recall.toFixed(6)),
    correctFieldCount: evidence.correctFieldCount,
    errorCode,
  };
}

export async function callTencentOcr({ image, environment, now = () => Date.now() }) {
  assertCredentialEnvironment(environment);
  const startedAt = now();
  const body = JSON.stringify({ ImageBase64: image.toString("base64") });
  const headers = buildTc3Headers({
    secretId: environment.TENCENTCLOUD_SECRET_ID,
    secretKey: environment.TENCENTCLOUD_SECRET_KEY,
    body,
    timestamp: Math.floor(Date.now() / 1000),
  });
  const milestones = { startedAt };

  return new Promise((resolve) => {
    let settled = false;
    let timeout;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(result);
    };
    const request = httpsRequest(
      {
        hostname: OCR_HOST,
        method: "POST",
        path: "/",
        headers,
        agent: false,
      },
      (response) => {
        milestones.firstByteAt = now();
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          milestones.endedAt = now();
          const responseText = Buffer.concat(chunks).toString("utf8");
          let payload;
          try {
            payload = JSON.parse(responseText);
          } catch {
            finish({ texts: [], errorCode: "OCR_INVALID_JSON", timing: timingSnapshot(milestones) });
            return;
          }
          const errorCode = payload?.Response?.Error?.Code ?? null;
          const texts = Array.isArray(payload?.Response?.TextDetections)
            ? payload.Response.TextDetections.map(({ DetectedText }) => DetectedText).filter(
                (value) => typeof value === "string",
              )
            : [];
          finish({ texts, errorCode, timing: timingSnapshot(milestones) });
        });
      },
    );
    request.on("socket", (socket) => {
      socket.on("lookup", () => { milestones.lookupAt = now(); });
      socket.on("connect", () => { milestones.connectAt = now(); });
      socket.on("secureConnect", () => { milestones.secureConnectAt = now(); });
    });
    request.on("finish", () => { milestones.requestFinishedAt = now(); });
    request.on("error", (error) => {
      milestones.endedAt = now();
      finish({
        texts: [],
        errorCode: error.message === "OCR_TIMEOUT" ? "OCR_TIMEOUT" : "OCR_REQUEST_FAILED",
        timing: timingSnapshot(milestones),
      });
    });
    timeout = setTimeout(
      () => request.destroy(new Error("OCR_TIMEOUT")),
      OCR_TIMEOUT_MS,
    );
    request.end(body);
  });
}

function timingSnapshot(milestones) {
  const startedAt = milestones.startedAt;
  const totalDurationMs = duration(startedAt, milestones.endedAt) ?? OCR_TIMEOUT_MS;
  return {
    totalDurationMs,
    phases: {
      dnsMs: duration(startedAt, milestones.lookupAt),
      tcpMs: duration(milestones.lookupAt, milestones.connectAt),
      tlsMs: duration(milestones.connectAt, milestones.secureConnectAt),
      uploadMs: duration(milestones.secureConnectAt, milestones.requestFinishedAt),
      serviceWaitMs: duration(milestones.requestFinishedAt, milestones.firstByteAt),
      responseReceiveMs: duration(milestones.firstByteAt, milestones.endedAt),
    },
  };
}

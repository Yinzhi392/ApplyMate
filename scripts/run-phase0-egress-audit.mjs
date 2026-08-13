import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  EGRESS_AUDIT_VERSION,
  assertSafeEgressArtifact,
  inspectOutboundRequest,
} from "./phase0-egress-audit-lib.mjs";
import { callTencentOcr } from "./phase0-ocr-latency-lib.mjs";
import {
  TOKENHUB_BASE_URL,
  assertNoProtectedText,
  maskProtectedText,
} from "./phase0-tokenhub-lib.mjs";

const DEFAULT_SYNTHETIC_IMAGE_PATH = "/private/tmp/applymate-egress-pii.svg.png";
const imagePath = process.env.PHASE0_OCR_IMAGE_FILE ?? DEFAULT_SYNTHETIC_IMAGE_PATH;
const apiKey = process.env.TOKENHUB_API_KEY?.trim();
const model = process.env.TOKENHUB_FALLBACK_MODEL ?? "hy3";

if (!process.argv.includes("--confirmed-preflight")) {
  throw new Error(
    "Refusing network calls without --confirmed-preflight after checking free quota, postpaid settings, and zero-cost billing.",
  );
}
if (resolve(imagePath) !== DEFAULT_SYNTHETIC_IMAGE_PATH) {
  throw new Error("The egress audit accepts only its fixed synthetic image.");
}
if (!apiKey) throw new Error("TOKENHUB_API_KEY is required.");
if ((process.env.TOKENHUB_BASE_URL ?? TOKENHUB_BASE_URL) !== TOKENHUB_BASE_URL) {
  throw new Error("Unexpected TokenHub base URL.");
}
if (process.env.TOKENHUB_PAID_FALLBACK !== "disabled") {
  throw new Error("TOKENHUB_PAID_FALLBACK=disabled is required.");
}
if (model !== "hy3") {
  throw new Error("The phase 0.13 audit is locked to hy3.");
}

const image = readFileSync(imagePath);
const ocrResult = await callTencentOcr({ image, environment: process.env });
if (ocrResult.errorCode || ocrResult.texts.length === 0) {
  throw new Error(
    `Tencent OCR egress audit failed: ${ocrResult.errorCode ?? "OCR_EMPTY_RESPONSE"}.`,
  );
}
const ocrText = ocrResult.texts.join("\n").trim();
const masked = maskProtectedText(ocrText);
if (masked.matchCount < 5) {
  throw new Error("Synthetic OCR output did not expose all five masking classes.");
}
assertNoProtectedText(masked.text);

const capturedAt = new Date().toISOString();
const ocrRequest = inspectOutboundRequest({
  provider: "ocr",
  url: "https://ocr.tencentcloudapi.com/",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: { ImageBase64: image.toString("base64") },
  metadata: { action: "GeneralBasicOCR", version: "2018-11-19" },
  capturedAt,
});

const tokenHubBody = {
  model,
  messages: [
    {
      role: "system",
      content:
        "你是 ApplyMate 的隐私边界验证模型。只确认收到脱敏文本，不补充或复原信息，只输出 JSON。",
    },
    {
      role: "user",
      content: `请返回 {"accepted":true,"maskCount":${masked.matchCount}}。以下仅为完全合成且已脱敏的 OCR 文本：\n${masked.text}`,
    },
  ],
  temperature: 0,
  max_tokens: 80,
  stream: false,
};
const tokenHubRequest = inspectOutboundRequest({
  provider: "tokenhub",
  url: `${TOKENHUB_BASE_URL}/chat/completions`,
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  },
  body: tokenHubBody,
  metadata: { model },
  capturedAt: new Date().toISOString(),
});

const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 45_000);
let response;
const startedAt = Date.now();
try {
  response = await fetch(`${TOKENHUB_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(tokenHubBody),
    signal: controller.signal,
  });
} finally {
  clearTimeout(timeout);
}
if (!response.ok) {
  throw new Error(`TokenHub returned HTTP ${response.status}.`);
}
const responsePayload = await response.json();
const responseContent = responsePayload?.choices?.[0]?.message?.content;
if (typeof responseContent !== "string" || responseContent.length === 0) {
  throw new Error("TokenHub returned no message content.");
}

const artifact = assertSafeEgressArtifact({
  auditVersion: EGRESS_AUDIT_VERSION,
  capturedAt: new Date().toISOString(),
  fixture: "synthetic-only",
  requests: [ocrRequest, tokenHubRequest],
  storesRawRequestBody: false,
  storesCredentials: false,
});
const safeArtifact = {
  ...artifact,
  ocrCaptureSurface: "direct-tc3-exact-request",
  tokenHubCaptureSurface: "direct-fetch-exact-request",
  ocrResponse: {
    errorCode: null,
    durationMs: ocrResult.timing.totalDurationMs,
    responseBodyStored: false,
  },
  masking: {
    expectedClasses: 5,
    matchCount: masked.matchCount,
    passed: true,
  },
  tokenHubResponse: {
    httpStatus: response.status,
    durationMs: Date.now() - startedAt,
    responseBodyStored: false,
    promptTokens: responsePayload?.usage?.prompt_tokens ?? null,
    completionTokens: responsePayload?.usage?.completion_tokens ?? null,
    totalTokens: responsePayload?.usage?.total_tokens ?? null,
  },
};
const outputPath = join(process.cwd(), "docs", "phase-10", "phase0-egress-audit.json");
writeFileSync(outputPath, `${JSON.stringify(safeArtifact, null, 2)}\n`, {
  mode: 0o600,
});
rmSync(DEFAULT_SYNTHETIC_IMAGE_PATH, { force: true });
console.log(
  JSON.stringify({
    outputPath,
    boundaryPassed: true,
    maskedCount: masked.matchCount,
    tokenHubStatus: response.status,
    storesRawContent: false,
  }),
);

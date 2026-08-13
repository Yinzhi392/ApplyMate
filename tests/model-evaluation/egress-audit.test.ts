import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

interface AuditModule {
  EGRESS_AUDIT_VERSION: string;
  inspectOutboundRequest(input: Record<string, unknown>): Record<string, unknown>;
  assertSafeEgressArtifact(input: Record<string, unknown>): {
    requests: Array<Record<string, unknown>>;
  };
}

let audit: AuditModule;

beforeAll(async () => {
  audit = (await import(
    "../../scripts/phase0-egress-audit-lib.mjs"
  )) as unknown as AuditModule;
});

const RAW_TEXT = [
  "手机 13812345678",
  "邮箱 candidate@example.com",
  "身份证 110105199001011234",
  "护照 E12345678",
  "地址 北京市朝阳区建国路88号1栋",
].join("\n");

describe("phase 0 egress audit", () => {
  it("locks the live runner to a fixed synthetic image and explicit preflight", () => {
    const runner = readFileSync(
      resolve("scripts/run-phase0-egress-audit.mjs"),
      "utf8",
    );

    expect(runner).toContain("--confirmed-preflight");
    expect(runner).toContain("/private/tmp/applymate-egress-pii.svg.png");
    expect(runner).toContain("callTencentOcr");
    expect(runner).toContain("rmSync(DEFAULT_SYNTHETIC_IMAGE_PATH");
    expect(runner).not.toContain("PHASE0_OCR_TEXT_FILE");
  });

  it("records only safe OCR request metadata", () => {
    const record = audit.inspectOutboundRequest({
      provider: "ocr",
      url: "https://ocr.tencentcloudapi.com/",
      headers: {
        Authorization: "TC3-HMAC-SHA256 secret-value",
        "Content-Type": "application/json; charset=utf-8",
      },
      body: { ImageBase64: "synthetic-image-base64" },
      metadata: { action: "GeneralBasicOCR", version: "2018-11-19" },
      capturedAt: "2026-08-11T00:00:00.000Z",
    });

    expect(record.containsImageContent).toBe(true);
    expect(record.authorizationHeaderPresent).toBe(true);
    expect(JSON.stringify(record)).not.toContain("secret-value");
    expect(JSON.stringify(record)).not.toContain("synthetic-image-base64");
  });

  it("rejects raw protected text and every image-shaped TokenHub payload", () => {
    const base = {
      provider: "tokenhub" as const,
      url: "https://tokenhub.tencentmaas.com/v1/chat/completions",
      headers: { Authorization: "Bearer secret", "Content-Type": "application/json" },
      metadata: { model: "hy3" },
    };

    expect(() =>
      audit.inspectOutboundRequest({ ...base, body: { messages: [{ content: RAW_TEXT }] } }),
    ).toThrow("Protected information remains");
    expect(() =>
      audit.inspectOutboundRequest({ ...base, body: { image_url: "data:image/png;base64,AAAA" } }),
    ).toThrow("image or file content");
    expect(() =>
      audit.inspectOutboundRequest({ ...base, body: { fileIds: ["file_1"] } }),
    ).toThrow("image or file content");
  });

  it("proves the complete synthetic OCR to masked TokenHub boundary", () => {
    const ocr = audit.inspectOutboundRequest({
      provider: "ocr",
      url: "https://ocr.tencentcloudapi.com/",
      headers: { "Content-Type": "application/json" },
      body: { ImageBase64: "synthetic-image-base64" },
      metadata: { action: "GeneralBasicOCR", version: "2018-11-19" },
      capturedAt: "2026-08-11T00:00:00.000Z",
    });
    const tokenhub = audit.inspectOutboundRequest({
      provider: "tokenhub",
      url: "https://tokenhub.tencentmaas.com/v1/chat/completions",
      headers: { Authorization: "Bearer secret", "Content-Type": "application/json" },
      body: {
        model: "hy3",
        messages: [
          {
            role: "user",
            content:
              "手机 [MASKED:phone] 邮箱 [MASKED:email] 身份证 [MASKED:nationalId] 护照 [MASKED:documentNumber] 地址 [MASKED:detailedAddress]",
          },
        ],
      },
      metadata: { model: "hy3" },
      capturedAt: "2026-08-11T00:00:01.000Z",
    });
    const artifact = audit.assertSafeEgressArtifact({
      auditVersion: audit.EGRESS_AUDIT_VERSION,
      capturedAt: "2026-08-11T00:00:01.000Z",
      fixture: "synthetic-only",
      requests: [ocr, tokenhub],
      storesRawRequestBody: false,
      storesCredentials: false,
    });

    expect(artifact.requests[1]?.protectedMatchCount).toBe(0);
    expect(JSON.stringify(artifact)).not.toContain("13812345678");
    expect(JSON.stringify(artifact)).not.toContain("candidate@example.com");
    expect(JSON.stringify(artifact)).not.toContain("secret");
  });

  it("keeps each safe evidence record free of response content and credentials", () => {
    const artifact = audit.assertSafeEgressArtifact({
      auditVersion: audit.EGRESS_AUDIT_VERSION,
      capturedAt: "2026-08-11T00:00:01.000Z",
      fixture: "synthetic-only",
      requests: [
        audit.inspectOutboundRequest({
          provider: "ocr",
          url: "https://ocr.tencentcloudapi.com/",
          headers: { "Content-Type": "application/json" },
          body: { ImageBase64: "synthetic-image-base64" },
          metadata: { action: "GeneralBasicOCR", version: "2018-11-19" },
        }),
        audit.inspectOutboundRequest({
          provider: "tokenhub",
          url: "https://tokenhub.tencentmaas.com/v1/chat/completions",
          headers: { Authorization: "Bearer secret", "Content-Type": "application/json" },
          body: { messages: [{ content: "只包含 [MASKED] 的合成文本" }] },
          metadata: { model: "hy3" },
        }),
      ],
      storesRawRequestBody: false,
      storesCredentials: false,
    });

    const evidence = {
      ...artifact,
      ocrResponse: { errorCode: null, durationMs: 1234, responseBodyStored: false },
      tokenHubResponse: { httpStatus: 200, durationMs: 567, responseBodyStored: false },
    };
    const serialized = JSON.stringify(evidence);

    expect(serialized).toContain('"responseBodyStored":false');
    expect(serialized).not.toContain("synthetic-image-base64");
    expect(serialized).not.toContain("Bearer secret");
  });

  it("keeps the latest live synthetic audit artifact structurally safe", () => {
    const artifact = JSON.parse(
      readFileSync(resolve("docs/phase-10/phase0-egress-audit.json"), "utf8"),
    ) as Record<string, unknown>;
    const serialized = JSON.stringify(artifact);
    const requests = artifact.requests as Array<Record<string, unknown>>;

    expect(artifact.fixture).toBe("synthetic-only");
    expect(requests).toHaveLength(2);
    expect(requests[0]).toMatchObject({
      provider: "ocr",
      containsImageContent: true,
      boundaryPassed: true,
    });
    expect(requests[1]).toMatchObject({
      provider: "tokenhub",
      containsImageContent: false,
      protectedMatchCount: 0,
      boundaryPassed: true,
    });
    expect(artifact.masking).toMatchObject({ expectedClasses: 5, matchCount: 5, passed: true });
    expect(artifact.ocrResponse).toMatchObject({ errorCode: null, responseBodyStored: false });
    expect(artifact.tokenHubResponse).toMatchObject({ httpStatus: 200, responseBodyStored: false });
    expect(serialized).not.toMatch(/ImageBase64|Bearer |TextDetections|RequestId/);
  });
});

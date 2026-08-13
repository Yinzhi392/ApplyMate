import { createHash } from "node:crypto";

import {
  assertNoProtectedText,
  maskProtectedText,
} from "./phase0-tokenhub-lib.mjs";

export const EGRESS_AUDIT_VERSION = "phase0-egress-v1";

const EXPECTED_DESTINATIONS = {
  ocr: {
    hostname: "ocr.tencentcloudapi.com",
    pathname: "/",
  },
  tokenhub: {
    hostname: "tokenhub.tencentmaas.com",
    pathname: "/v1/chat/completions",
  },
};

const IMAGE_FIELD_NAMES = new Set([
  "image",
  "images",
  "imagebase64",
  "imageurl",
  "image_url",
  "fileid",
  "fileids",
]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeHeaders(headers = {}) {
  if (headers instanceof Headers) {
    return Object.fromEntries(
      Array.from(headers.entries(), ([key, value]) => [key.toLowerCase(), value]),
    );
  }
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [
      key.toLowerCase(),
      String(value),
    ]),
  );
}

function serializeBody(body) {
  if (Buffer.isBuffer(body) || body instanceof Uint8Array) {
    return Buffer.from(body);
  }
  if (typeof body === "string") {
    return Buffer.from(body, "utf8");
  }
  return Buffer.from(JSON.stringify(body), "utf8");
}

function inspectValueForImages(value, key = "") {
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return true;
  if (IMAGE_FIELD_NAMES.has(key.toLowerCase())) return true;
  if (typeof value === "string") {
    return (
      /^data:image\//iu.test(value) ||
      /^https?:\/\/[^\s]+\.(?:png|jpe?g|webp)(?:[?#]|$)/iu.test(value)
    );
  }
  if (Array.isArray(value)) {
    return value.some((item) => inspectValueForImages(item));
  }
  if (value !== null && typeof value === "object") {
    return Object.entries(value).some(([childKey, childValue]) =>
      inspectValueForImages(childValue, childKey),
    );
  }
  return false;
}

function parseJsonBody(body) {
  if (body !== null && typeof body === "object" && !Buffer.isBuffer(body)) {
    return body;
  }
  if (typeof body !== "string") return null;
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

export function inspectOutboundRequest({
  provider,
  url,
  method = "POST",
  headers,
  body,
  metadata = {},
  capturedAt = new Date().toISOString(),
}) {
  if (!(provider in EXPECTED_DESTINATIONS)) {
    throw new Error("Unsupported outbound provider.");
  }
  const destination = new URL(url);
  const expected = EXPECTED_DESTINATIONS[provider];
  if (
    destination.protocol !== "https:" ||
    destination.hostname !== expected.hostname ||
    destination.pathname !== expected.pathname
  ) {
    throw new Error(`Unexpected ${provider} destination.`);
  }
  if (method.toUpperCase() !== "POST") {
    throw new Error("Outbound providers require POST.");
  }

  const normalizedHeaders = normalizeHeaders(headers);
  const bodyBytes = serializeBody(body);
  const bodyText = bodyBytes.toString("utf8");
  const jsonBody = parseJsonBody(body);
  const containsImageContent =
    Buffer.isBuffer(body) ||
    body instanceof Uint8Array ||
    inspectValueForImages(jsonBody ?? body);
  const protectedMatchCount = maskProtectedText(bodyText).matchCount;

  if (provider === "ocr") {
    if (!containsImageContent) {
      throw new Error("OCR request must contain one validated image.");
    }
    if (
      metadata.action !== "GeneralBasicOCR" ||
      metadata.version !== "2018-11-19"
    ) {
      throw new Error("Unexpected OCR API action or version.");
    }
  } else {
    if (containsImageContent) {
      throw new Error("TokenHub request contains image or file content.");
    }
    assertNoProtectedText(bodyText);
  }

  return {
    auditVersion: EGRESS_AUDIT_VERSION,
    capturedAt,
    provider,
    destination: `${destination.origin}${destination.pathname}`,
    method: "POST",
    contentType: normalizedHeaders["content-type"] ?? null,
    authorizationHeaderPresent: "authorization" in normalizedHeaders,
    headerNames: Object.keys(normalizedHeaders).sort(),
    payloadByteLength: bodyBytes.byteLength,
    payloadSha256: sha256(bodyBytes),
    containsImageContent,
    protectedMatchCount,
    boundaryPassed: true,
    metadata: {
      ...(metadata.action === undefined ? {} : { action: metadata.action }),
      ...(metadata.version === undefined ? {} : { version: metadata.version }),
      ...(metadata.model === undefined ? {} : { model: metadata.model }),
    },
  };
}

export function assertSafeEgressArtifact(artifact) {
  if (
    artifact === null ||
    typeof artifact !== "object" ||
    artifact.auditVersion !== EGRESS_AUDIT_VERSION ||
    !Array.isArray(artifact.requests) ||
    artifact.requests.length !== 2
  ) {
    throw new Error("Egress artifact has an invalid structure.");
  }
  const [ocr, tokenhub] = artifact.requests;
  if (
    ocr?.provider !== "ocr" ||
    ocr.containsImageContent !== true ||
    tokenhub?.provider !== "tokenhub" ||
    tokenhub.containsImageContent !== false ||
    tokenhub.protectedMatchCount !== 0 ||
    artifact.storesRawRequestBody !== false ||
    artifact.storesCredentials !== false
  ) {
    throw new Error("Egress artifact does not prove the required boundary.");
  }
  return artifact;
}

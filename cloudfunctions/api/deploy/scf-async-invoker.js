"use strict";

const { createHash, createHmac } = require("node:crypto");

const HOST = "scf.tencentcloudapi.com";
const SERVICE = "scf";
const VERSION = "2018-04-16";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key, value, encoding) {
  return createHmac("sha256", key).update(value, "utf8").digest(encoding);
}

function signedHeaders({ secretId, secretKey, sessionToken, region, body, timestamp }) {
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${HOST}\n`;
  const canonicalRequest = ["POST", "/", "", canonicalHeaders, "content-type;host", sha256(body)].join("\n");
  const scope = `${date}/${SERVICE}/tc3_request`;
  const stringToSign = ["TC3-HMAC-SHA256", String(timestamp), scope, sha256(canonicalRequest)].join("\n");
  const signingKey = hmac(hmac(hmac(`TC3${secretKey}`, date), SERVICE), "tc3_request");
  const signature = hmac(signingKey, stringToSign, "hex");
  return {
    Authorization: `TC3-HMAC-SHA256 Credential=${secretId}/${scope}, SignedHeaders=content-type;host, Signature=${signature}`,
    "Content-Type": "application/json; charset=utf-8",
    Host: HOST,
    "X-TC-Action": "Invoke",
    "X-TC-Region": region,
    "X-TC-Timestamp": String(timestamp),
    "X-TC-Version": VERSION,
    ...(sessionToken ? { "X-TC-Token": sessionToken } : {}),
  };
}

function createScfAsyncInvoker({
  secretId,
  secretKey,
  sessionToken,
  region,
  namespace,
  fetchImpl = fetch,
  now = () => new Date(),
}) {
  if (![secretId, secretKey, region, namespace].every((value) => typeof value === "string" && value.length > 0)) {
    throw new Error("SCF_ASYNC_CREDENTIALS_MISSING");
  }
  return async (jobId) => {
    const body = JSON.stringify({
      FunctionName: "worker",
      InvocationType: "Event",
      Namespace: namespace,
      ClientContext: JSON.stringify({ jobId }),
    });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    try {
      const response = await fetchImpl(`https://${HOST}/`, {
        method: "POST",
        headers: signedHeaders({
          secretId,
          secretKey,
          sessionToken,
          region,
          body,
          timestamp: Math.floor(now().getTime() / 1000),
        }),
        body,
        signal: controller.signal,
      });
      const payload = await response.json();
      if (!response.ok || payload?.Response?.Error || payload?.Response?.Result?.InvokeResult !== 0) {
        throw new Error("SCF_ASYNC_INVOKE_FAILED");
      }
      return { ok: true, data: { accepted: true } };
    } finally {
      clearTimeout(timeout);
    }
  };
}

module.exports = { createScfAsyncInvoker, signedHeaders };

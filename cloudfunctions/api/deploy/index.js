"use strict";

const CloudBase = require("@cloudbase/js-sdk");
const { createLiveApiHandler } = require("./live-api");
const { createScfAsyncInvoker } = require("./scf-async-invoker");

function readBootstrapTokenHash() {
  return process.env.APPLYMATE_ADMIN_BOOTSTRAP_TOKEN_SHA256;
}

function hasValue(value) {
  return typeof value === "string" && value.length > 0;
}

function realAiEnabled() {
  return process.env.APPLYMATE_REAL_AI_ENABLED === "true";
}

exports.main = async (event, context) => {
  const cloudbaseContext = CloudBase.getCloudbaseContext(context);
  if (event && event.healthcheck === true) {
    return {
      ok: true,
      data: {
        runtime: "api",
        state: realAiEnabled() ? "experience_real_ai_live" : "experience_real_ai_paused",
        acceptsUserTraffic: realAiEnabled(),
        credentialDiagnostic: {
          hasSecretId: hasValue(cloudbaseContext.TENCENTCLOUD_SECRETID),
          hasSecretKey: hasValue(cloudbaseContext.TENCENTCLOUD_SECRETKEY),
          hasSessionToken: hasValue(cloudbaseContext.TENCENTCLOUD_SESSIONTOKEN),
          hasCloudBaseApiKey: hasValue(cloudbaseContext.CLOUDBASE_APIKEY),
          hasEnvironmentId: hasValue(cloudbaseContext.TCB_ENV),
          hasNamespace: hasValue(cloudbaseContext.SCF_NAMESPACE),
        },
      },
    };
  }
  // Ordinary event cloud functions authenticate automatically. The Node
  // request signer is installed as a runtime dependency, so keep the SDK on
  // the current CloudBase environment and do not override temporary runtime
  // credentials from application code.
  const app = CloudBase.init({
    env: CloudBase.SYMBOL_DEFAULT_ENV,
    ...(hasValue(cloudbaseContext.CLOUDBASE_APIKEY)
      ? { accessKey: cloudbaseContext.CLOUDBASE_APIKEY }
      : {}),
  });
  const readTrustedIdentity = async () => {
    const userInfo = await app.auth.getUserInfo();
    if (userInfo && hasValue(userInfo.openId)) {
      return { value: userInfo.openId, namespace: "applymate-openid-v1" };
    }
    if (userInfo && hasValue(userInfo.uid)) {
      return { value: userInfo.uid, namespace: "web-anonymous-uid-v1" };
    }
    return null;
  };
  const dispatchExperienceJob = async (jobId) => {
    if (!realAiEnabled()) {
      return { ok: false, error: { code: "RESOURCE_PAUSED", message: "Real AI is not enabled.", retryable: true } };
    }
    try {
      const invokeWorkerAsynchronously = createScfAsyncInvoker({
        secretId: cloudbaseContext.TENCENTCLOUD_SECRETID,
        secretKey: cloudbaseContext.TENCENTCLOUD_SECRETKEY,
        sessionToken: cloudbaseContext.TENCENTCLOUD_SESSIONTOKEN,
        region: cloudbaseContext.TENCENTCLOUD_REGION || process.env.TENCENTCLOUD_REGION || "ap-shanghai",
        namespace: cloudbaseContext.SCF_NAMESPACE || cloudbaseContext.TCB_ENV,
      });
      return await invokeWorkerAsynchronously(jobId);
    } catch {
      return { ok: false, error: { code: "WORKER_DISPATCH_FAILED", message: "AI task could not be queued.", retryable: true } };
    }
  };
  return createLiveApiHandler({
    database: app.database(),
    experienceEnabled: realAiEnabled(),
    dispatchExperienceJob,
    dispatchReliabilityProbe: async (jobId) => {
      const response = await app.callFunction({
        name: "worker",
        data: { jobId },
        parse: true,
      });
      const result = typeof response.result === "string"
        ? JSON.parse(response.result)
        : response.result;
      if (!result || result.ok !== true) {
        throw new Error("Reliability worker dispatch failed.");
      }
    },
    readBootstrapTokenHash,
    readTrustedIdentity,
  })(event);
};

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

function publicWebV3Enabled() {
  return process.env.APPLYMATE_PUBLIC_WEB_V3 === "true";
}

function anonymousFlag(...values) {
  for (const value of values) {
    if (value === true || value === 1 || value === "1" || value === "true") return true;
    if (value === false || value === 0 || value === "0" || value === "false") return false;
  }
  return null;
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
        publicWebV3: publicWebV3Enabled(),
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
    // Browser callers expose their trusted CloudBase identity to ordinary functions
    // through the trusted runtime context. The server SDK auth instance does
    // not reliably reconstruct that caller when invoked from Web Hosting.
    if (hasValue(cloudbaseContext.WX_OPENID)) {
      return { value: cloudbaseContext.WX_OPENID, namespace: "applymate-openid-v1" };
    }
    if (hasValue(cloudbaseContext.TCB_UUID)) {
      let isAnonymous = anonymousFlag(
        cloudbaseContext.isAnonymous,
        cloudbaseContext.IS_ANONYMOUS,
        cloudbaseContext.TCB_ISANONYMOUS_USER,
      );
      if (isAnonymous === null) {
        try {
          const userInfo = await app.auth.getUserInfo();
          isAnonymous = anonymousFlag(userInfo?.isAnonymous, userInfo?.is_anonymous);
          if (isAnonymous === null && hasValue(userInfo?.loginType)) {
            const loginType = userInfo.loginType.toUpperCase();
            if (loginType.includes("ANONYMOUS")) isAnonymous = true;
            if (loginType.includes("EMAIL")) isAnonymous = false;
          }
        } catch {
          // Some Web Hosting invocations expose only TCB_UUID. The current Web
          // product uses email OTP, so an unmarked Web identity is registered;
          // Legacy anonymous callers must carry an explicit anonymous marker.
        }
      }
      return {
        value: cloudbaseContext.TCB_UUID,
        namespace: isAnonymous === true ? "web-anonymous-uid-v1" : "web-email-uid-v1",
      };
    }

    // Retain the SDK fallback for runtimes that provide identity through the
    // auth object instead of the ordinary-function context fields.
    const userInfo = await app.auth.getUserInfo();
    if (userInfo && hasValue(userInfo.openId)) {
      return { value: userInfo.openId, namespace: "applymate-openid-v1" };
    }
    if (userInfo && hasValue(userInfo.uid)) {
      const isAnonymous = anonymousFlag(userInfo.isAnonymous, userInfo.is_anonymous);
      const emailLogin = hasValue(userInfo.loginType) && userInfo.loginType.toUpperCase().includes("EMAIL");
      return {
        value: userInfo.uid,
        namespace: isAnonymous === true && !emailLogin
          ? "web-anonymous-uid-v1"
          : "web-email-uid-v1",
      };
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
    publicWebV3: publicWebV3Enabled(),
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

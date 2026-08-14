"use strict";

const CloudBase = require("@cloudbase/js-sdk");
const { createReliabilityWorker } = require("./reliability-worker");
const { createExperienceWorker } = require("./experience-worker");

const RUNTIME = "worker";

function realAiEnabled() {
  return process.env.APPLYMATE_REAL_AI_ENABLED === "true";
}

function hasEnvironmentValue(name) {
  return typeof process.env[name] === "string" && process.env[name].length > 0;
}

function dedicatedOcrCredentialsAvailable() {
  return hasEnvironmentValue("APPLYMATE_OCR_SECRET_ID") &&
    hasEnvironmentValue("APPLYMATE_OCR_SECRET_KEY");
}

function cloudBaseApiKey(context) {
  const cloudbaseContext = CloudBase.getCloudbaseContext(context);
  return cloudbaseContext.CLOUDBASE_APIKEY || process.env.CLOUDBASE_APIKEY;
}

function realAiReady(context) {
  return realAiEnabled() && hasEnvironmentValue("TOKENHUB_API_KEY") &&
    dedicatedOcrCredentialsAvailable() &&
    typeof cloudBaseApiKey(context) === "string" && cloudBaseApiKey(context).length > 0;
}

function safeResponse(event, credentialDiagnostic, ready = false) {
  if (event && event.healthcheck === true) {
    return {
      ok: true,
      data: {
        runtime: RUNTIME,
        state: ready ? "experience_real_ai_live" : "experience_real_ai_paused",
        acceptsUserTraffic: ready,
        ...(credentialDiagnostic ? { credentialDiagnostic } : {}),
      },
    };
  }
  return {
    ok: false,
    error: {
      code: "RESOURCE_PAUSED",
      message: "The production worker is not enabled yet.",
      retryable: true,
    },
  };
}

exports.main = async (event, context) => {
  if (event && event.healthcheck === true) {
    const accessKey = cloudBaseApiKey(context);
    return safeResponse(event, realAiEnabled() ? {
      hasModelApiKey: hasEnvironmentValue("TOKENHUB_API_KEY"),
      hasOcrSecretId: hasEnvironmentValue("APPLYMATE_OCR_SECRET_ID"),
      hasOcrSecretKey: hasEnvironmentValue("APPLYMATE_OCR_SECRET_KEY"),
      hasOcrSessionToken: hasEnvironmentValue("APPLYMATE_OCR_SESSION_TOKEN"),
      hasCloudBaseApiKey: typeof accessKey === "string" && accessKey.length > 0,
      usesDedicatedOcrCredentials: dedicatedOcrCredentialsAvailable(),
    } : undefined, realAiReady(context));
  }
  if (!event || typeof event.jobId !== "string") {
    return safeResponse(event);
  }
  const accessKey = cloudBaseApiKey(context);
  const app = CloudBase.init({
    env: CloudBase.SYMBOL_DEFAULT_ENV,
    ...(typeof accessKey === "string" && accessKey.length > 0 ? { accessKey } : {}),
  });
  if (/^job_probe_[a-f0-9]{24}$/u.test(event.jobId)) {
    return createReliabilityWorker({ database: app.database() })(event);
  }
  if (!realAiReady(context)) return safeResponse(event);
  return createExperienceWorker({
    app,
    database: app.database(),
    credentials: {
      secretId: process.env.APPLYMATE_OCR_SECRET_ID,
      secretKey: process.env.APPLYMATE_OCR_SECRET_KEY,
      token: process.env.APPLYMATE_OCR_SESSION_TOKEN,
    },
  })(event);
};
exports.safeResponse = safeResponse;

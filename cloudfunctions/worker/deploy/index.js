"use strict";

const CloudBase = require("@cloudbase/js-sdk");
const { createReliabilityWorker } = require("./reliability-worker");
const { createExperienceWorker } = require("./experience-worker");

const RUNTIME = "worker";

function realAiEnabled() {
  return process.env.APPLYMATE_REAL_AI_ENABLED === "true";
}

function safeResponse(event) {
  if (event && event.healthcheck === true) {
    return {
      ok: true,
      data: {
        runtime: RUNTIME,
        state: realAiEnabled() ? "experience_real_ai_live" : "experience_real_ai_paused",
        acceptsUserTraffic: realAiEnabled(),
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
  if (event && event.healthcheck === true) return safeResponse(event);
  if (!event || typeof event.jobId !== "string") {
    return safeResponse(event);
  }
  const app = CloudBase.init({ env: CloudBase.SYMBOL_DEFAULT_ENV });
  if (/^job_probe_[a-f0-9]{24}$/u.test(event.jobId)) {
    return createReliabilityWorker({ database: app.database() })(event);
  }
  if (!realAiEnabled()) return safeResponse(event);
  const cloudbaseContext = CloudBase.getCloudbaseContext(context);
  return createExperienceWorker({
    app,
    database: app.database(),
    credentials: {
      secretId: process.env.TENCENTCLOUD_SECRET_ID || cloudbaseContext.TENCENTCLOUD_SECRETID,
      secretKey: process.env.TENCENTCLOUD_SECRET_KEY || cloudbaseContext.TENCENTCLOUD_SECRETKEY,
      token: process.env.TENCENTCLOUD_SESSION_TOKEN || cloudbaseContext.TENCENTCLOUD_SESSIONTOKEN,
    },
  })(event);
};
exports.safeResponse = safeResponse;

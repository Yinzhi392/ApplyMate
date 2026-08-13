"use strict";

const CloudBase = require("@cloudbase/js-sdk");
const { createReliabilityWorker } = require("./reliability-worker");

const RUNTIME = "worker";

function safeResponse(event) {
  if (event && event.healthcheck === true) {
    return {
      ok: true,
      data: {
        runtime: RUNTIME,
        state: "reliability_probe_live",
        acceptsUserTraffic: false,
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
  if (!event || typeof event.jobId !== "string" || !/^job_probe_[a-f0-9]{24}$/u.test(event.jobId)) {
    return safeResponse(event);
  }
  const app = CloudBase.init({ env: CloudBase.SYMBOL_DEFAULT_ENV });
  return createReliabilityWorker({ database: app.database() })(event);
};
exports.safeResponse = safeResponse;

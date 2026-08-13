"use strict";

const CloudBase = require("@cloudbase/js-sdk");
const { createReliabilityCleanup } = require("./reliability-cleanup");
const { createSyntheticAccountDeletion } = require("./synthetic-account-deletion");

exports.main = async (event) => {
  if (event && event.healthcheck === true) {
    return {
      ok: true,
      data: {
        runtime: "cleanup",
        state: "reliability_probe_live",
        acceptsUserTraffic: false,
      },
    };
  }
  if (!event || event.reliabilityProbeCleanup !== true || Object.keys(event).length !== 1) {
    if (event && event.syntheticAccountDeletionCleanup === true) {
      const app = CloudBase.init({ env: CloudBase.SYMBOL_DEFAULT_ENV });
      return createSyntheticAccountDeletion({ database: app.database() })(event);
    }
    return {
      ok: false,
      error: {
        code: "RESOURCE_PAUSED",
        message: "Only synthetic reliability-probe cleanup is enabled.",
        retryable: true,
      },
    };
  }
  const app = CloudBase.init({ env: CloudBase.SYMBOL_DEFAULT_ENV });
  return createReliabilityCleanup({ database: app.database() })(event);
};

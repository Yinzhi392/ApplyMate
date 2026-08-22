"use strict";

const CloudBase = require("@cloudbase/js-sdk");
const { createReliabilityCleanup } = require("./reliability-cleanup");
const { createSyntheticAccountDeletion } = require("./synthetic-account-deletion");
const { createWebMaintenanceCleanup } = require("./web-maintenance-cleanup");

function createCloudBaseApp(context) {
  const cloudbaseContext = CloudBase.getCloudbaseContext(context);
  const accessKey = cloudbaseContext.CLOUDBASE_APIKEY || process.env.CLOUDBASE_APIKEY;
  return CloudBase.init({
    env: CloudBase.SYMBOL_DEFAULT_ENV,
    ...(typeof accessKey === "string" && accessKey.length > 0 ? { accessKey } : {}),
  });
}

exports.main = async (event, context) => {
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
    if (event && event.webMaintenanceCleanup === true && Object.keys(event).length === 1) {
      const app = createCloudBaseApp(context);
      return createWebMaintenanceCleanup({ database: app.database() })(event);
    }
    if (event && event.syntheticAccountDeletionCleanup === true) {
      const app = createCloudBaseApp(context);
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
  const app = createCloudBaseApp(context);
  return createReliabilityCleanup({ database: app.database() })(event);
};

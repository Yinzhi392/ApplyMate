"use strict";

const CloudBase = require("@cloudbase/js-sdk");
const { createLiveApiHandler } = require("./live-api");

function readTrustedOpenId() {
  return process.env.WX_OPENID;
}

function readBootstrapTokenHash() {
  return process.env.APPLYMATE_ADMIN_BOOTSTRAP_TOKEN_SHA256;
}

function hasValue(value) {
  return typeof value === "string" && value.length > 0;
}

exports.main = async (event, context) => {
  const cloudbaseContext = CloudBase.getCloudbaseContext(context);
  if (event && event.healthcheck === true) {
    return {
      ok: true,
      data: {
        runtime: "api",
        state: "invite_live_limited",
        acceptsUserTraffic: false,
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
  });
  return createLiveApiHandler({
    database: app.database(),
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
    readTrustedOpenId,
  })(event);
};

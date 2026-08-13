import type { ApiClient } from "./api-client.js";
import { createRequestId } from "./api-client.js";
import { createAnalyticsTracker, type ClientAnalyticsEvent } from "../core/analytics.js";
import {
  createCloudBaseApiClient,
  isExplicitDemoMode,
  RUNTIME_MODE_STORAGE_KEY,
} from "./cloudbase-api.js";
import { createDemoApiClient } from "./demo-api.js";

const JOB_STORAGE_KEY = "applymate:last-job-id";

export interface RuntimeState {
  api: ApiClient;
  mode: "cloudbase_experience" | "demo";
  demoInviteCode: string;
  getLastJobId(): string;
  setLastJobId(jobId: string): void;
  trackAnalytics(event: ClientAnalyticsEvent): Promise<boolean>;
}

interface RuntimeApp {
  globalData: RuntimeState;
}

export function createRuntime(): RuntimeState {
  const mode = isExplicitDemoMode({
    get: (key) => wx.getStorageSync(key),
  })
    ? "demo"
    : "cloudbase_experience";
  const api = mode === "demo" ? createDemoApiClient() : createCloudBaseApiClient();
  const analytics = createAnalyticsTracker(
    api,
    {
      get: (key) => wx.getStorageSync(key),
      set: (key, value) => wx.setStorageSync(key, value),
    },
    createRequestId,
  );
  return {
    api,
    mode,
    demoInviteCode: mode === "demo" ? "APPLYMATE" : "",
    getLastJobId(): string {
      return wx.getStorageSync<string>(JOB_STORAGE_KEY) ?? "";
    },
    setLastJobId(jobId: string): void {
      wx.setStorageSync(JOB_STORAGE_KEY, jobId);
    },
    trackAnalytics: analytics.track,
  };
}

export function enableCloudBaseIdentityTestMode(): void {
  wx.removeStorageSync(RUNTIME_MODE_STORAGE_KEY);
}

export function disableCloudBaseIdentityTestMode(): void {
  wx.setStorageSync(RUNTIME_MODE_STORAGE_KEY, "demo");
}

export function runtime(): RuntimeState {
  return getApp<RuntimeApp>().globalData;
}

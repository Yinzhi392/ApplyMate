import type { ApiClient } from "./api-client.js";
import { createRequestId } from "./api-client.js";
import { createAnalyticsTracker, type ClientAnalyticsEvent } from "../core/analytics.js";
import type { ClientResultPreview } from "../core/job-poller.js";
import {
  createCloudBaseApiClient,
  isExplicitDemoMode,
  RUNTIME_MODE_STORAGE_KEY,
} from "./cloudbase-api.js";
import { createDemoApiClient } from "./demo-api.js";

const JOB_STORAGE_KEY = "applymate:last-job-id";

export interface ClientJobTiming {
  apiCreateMs: number;
  selectionStartedAtMs: number;
}

export interface RuntimeState {
  api: ApiClient;
  mode: "cloudbase_experience" | "demo";
  demoInviteCode: string;
  getLastJobId(): string;
  getJobTiming(jobId: string): ClientJobTiming | undefined;
  getResultPreview(applicationId: string): ClientResultPreview | undefined;
  clearJobTiming(jobId: string): void;
  clearResultPreview(applicationId: string): void;
  setJobTiming(jobId: string, timing: ClientJobTiming): void;
  setResultPreview(preview: ClientResultPreview): void;
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
  const resultPreviews = new Map<string, ClientResultPreview>();
  const jobTimings = new Map<string, ClientJobTiming>();
  return {
    api,
    mode,
    demoInviteCode: mode === "demo" ? "APPLYMATE" : "",
    getLastJobId(): string {
      return wx.getStorageSync<string>(JOB_STORAGE_KEY) ?? "";
    },
    getJobTiming(jobId: string): ClientJobTiming | undefined {
      return jobTimings.get(jobId);
    },
    getResultPreview(applicationId: string): ClientResultPreview | undefined {
      return resultPreviews.get(applicationId);
    },
    clearResultPreview(applicationId: string): void {
      resultPreviews.delete(applicationId);
    },
    clearJobTiming(jobId: string): void {
      jobTimings.delete(jobId);
    },
    setResultPreview(preview: ClientResultPreview): void {
      resultPreviews.set(preview.applicationId, preview);
    },
    setJobTiming(jobId: string, timing: ClientJobTiming): void {
      jobTimings.set(jobId, timing);
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

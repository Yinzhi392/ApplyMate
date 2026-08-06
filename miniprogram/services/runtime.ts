import type { ApiClient } from "./api-client.js";
import { createDemoApiClient } from "./demo-api.js";

const JOB_STORAGE_KEY = "applymate:last-job-id";

export interface RuntimeState {
  api: ApiClient;
  mode: "demo";
  demoInviteCode: string;
  getLastJobId(): string;
  setLastJobId(jobId: string): void;
}

interface RuntimeApp {
  globalData: RuntimeState;
}

export function createRuntime(): RuntimeState {
  const api = createDemoApiClient();
  return {
    api,
    mode: "demo",
    demoInviteCode: "APPLYMATE",
    getLastJobId(): string {
      return wx.getStorageSync<string>(JOB_STORAGE_KEY) ?? "";
    },
    setLastJobId(jobId: string): void {
      wx.setStorageSync(JOB_STORAGE_KEY, jobId);
    },
  };
}

export function runtime(): RuntimeState {
  return getApp<RuntimeApp>().globalData;
}

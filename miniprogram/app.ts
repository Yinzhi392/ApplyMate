import { createRuntime } from "./services/runtime.js";
import {
  applyRuntimeModeFromLaunchQuery,
  initializeCloudBase,
} from "./services/cloudbase-api.js";

export interface ApplyMateApp {
  globalData: ReturnType<typeof createRuntime>;
}

App<ApplyMateApp>({
  globalData: createRuntime(),
  onLaunch(options): void {
    const runtimeModeChanged = applyRuntimeModeFromLaunchQuery(options.query, {
      set: (key, value) => wx.setStorageSync(key, value),
    });
    if (runtimeModeChanged) {
      this.globalData = createRuntime();
    }
    initializeCloudBase();
    void this.globalData.trackAnalytics({ event: "app_opened" });
  },
});

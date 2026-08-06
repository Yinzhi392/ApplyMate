import { createRuntime } from "./services/runtime.js";

export interface ApplyMateApp {
  globalData: ReturnType<typeof createRuntime>;
}

App<ApplyMateApp>({
  globalData: createRuntime(),
});

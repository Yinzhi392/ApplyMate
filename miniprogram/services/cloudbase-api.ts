import {
  createApiClient,
  type ApiClient,
  type CloudFunctionCaller,
} from "./api-client.js";

export const CLOUDBASE_ENV_ID = "applymate-mvp-d0g005nnw103af4c3";
export const RUNTIME_MODE_STORAGE_KEY = "applymate:runtime-mode";
const IDENTITY_TEST_MODE = "cloudbase_identity_test";
export const RUNTIME_MODE_LAUNCH_QUERY_KEY = "applymateRuntime";

export interface RuntimeStorage {
  get(key: string): unknown;
}

export interface RuntimeStorageWriter {
  set(key: string, value: string): void;
}

export function isCloudBaseIdentityTestMode(storage: RuntimeStorage): boolean {
  return storage.get(RUNTIME_MODE_STORAGE_KEY) === IDENTITY_TEST_MODE;
}

export function applyRuntimeModeFromLaunchQuery(
  query: Record<string, string | undefined> | undefined,
  storage: RuntimeStorageWriter,
): boolean {
  if (query?.[RUNTIME_MODE_LAUNCH_QUERY_KEY] !== IDENTITY_TEST_MODE) {
    return false;
  }
  storage.set(RUNTIME_MODE_STORAGE_KEY, IDENTITY_TEST_MODE);
  return true;
}

export function createCloudBaseApiClient(
  callFunction: CloudFunctionCaller = (request) =>
    wx.cloud.callFunction({
      name: request.name,
      data: request.data,
    }),
): ApiClient {
  return createApiClient(callFunction);
}

export function initializeCloudBase(): void {
  wx.cloud.init({ env: CLOUDBASE_ENV_ID, traceUser: false });
}

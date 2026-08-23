const environmentId = import.meta.env.VITE_CLOUDBASE_ENV_ID?.trim() ?? "";

export const cloudbaseConfigured = environmentId.length > 0;

export interface CloudbaseAuthClient {
  getLoginState(): Promise<unknown>;
  signInWithOtp(input: { email: string }): Promise<{
    data?: {
      verifyOtp?: (input: { token: string }) => Promise<{
        data?: { user?: unknown };
        error?: { message?: string } | null;
      }>;
    };
    error?: { message?: string } | null;
  }>;
  signOut(): Promise<unknown>;
}

export interface CloudbaseWebApp {
  auth(options: { persistence: "local" }): CloudbaseAuthClient;
  callFunction(options: { name: string; data: Record<string, unknown> }): Promise<{ result?: unknown }>;
  deleteFile(options: { fileList: string[] }): Promise<unknown>;
  getTempFileURL(options: { fileList: string[] }): Promise<unknown>;
  uploadFile(options: {
    cloudPath: string;
    fileContent: Blob;
    filePath: string;
  }): Promise<{ fileID?: unknown }>;
}

let appPromise: Promise<CloudbaseWebApp | undefined> | undefined;

export function getCloudbaseApp(): Promise<CloudbaseWebApp | undefined> {
  if (appPromise !== undefined) return appPromise;
  appPromise = cloudbaseConfigured
    ? import("@cloudbase/js-sdk").then(({ default: Cloudbase }) => Cloudbase.init({
        env: environmentId,
        persistence: "local",
        region: import.meta.env.VITE_CLOUDBASE_REGION?.trim() || "ap-shanghai",
      }) as unknown as CloudbaseWebApp)
    : Promise.resolve(undefined);
  return appPromise;
}

export async function requireCloudbaseApp(): Promise<CloudbaseWebApp> {
  const app = await getCloudbaseApp();
  if (app === undefined) {
    throw new Error("正式网站环境尚未配置，请稍后再试或联系支持。");
  }
  return app;
}

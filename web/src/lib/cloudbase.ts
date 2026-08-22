import Cloudbase from "@cloudbase/js-sdk";

const environmentId = import.meta.env.VITE_CLOUDBASE_ENV_ID?.trim() ?? "";

export const cloudbaseConfigured = environmentId.length > 0;

export const cloudbaseApp = cloudbaseConfigured
  ? Cloudbase.init({
      env: environmentId,
      persistence: "local",
      region: import.meta.env.VITE_CLOUDBASE_REGION?.trim() || "ap-shanghai",
    })
  : undefined;

export async function ensureAnonymousIdentity(): Promise<void> {
  if (cloudbaseApp === undefined) {
    throw new Error("Web 测试环境尚未配置，请联系管理员。");
  }
  const auth = cloudbaseApp.auth({ persistence: "local" });
  const loginState = await auth.getLoginState();
  if (loginState !== null) {
    return;
  }
  const result = await auth.signInAnonymously();
  if (result.error) {
    throw new Error(result.error.message || "匿名身份创建失败，请重试。");
  }
}

function safeExtension(name: string): string {
  const match = name.toLowerCase().match(/\.([a-z0-9]{1,8})$/u);
  return match?.[1] ?? "bin";
}

function safeOwnerId(ownerId: string): string {
  if (!/^user_[a-f0-9]{24}$/u.test(ownerId)) {
    throw new Error("当前匿名身份无效，请刷新页面后重试。");
  }
  return ownerId;
}

export async function uploadTemporaryFile(file: File, ownerId: string): Promise<string> {
  if (cloudbaseApp === undefined) {
    throw new Error("Web 测试环境尚未配置，请联系管理员。");
  }
  const cloudPath = `temporary/web/${safeOwnerId(ownerId)}/${Date.now()}-${crypto.randomUUID()}.${safeExtension(file.name)}`;
  const response = await cloudbaseApp.uploadFile({
    cloudPath,
    filePath: file.name,
    fileContent: file,
  });
  if (typeof response.fileID !== "string" || response.fileID.length === 0) {
    throw new Error("文件上传失败，请重试。");
  }
  return response.fileID;
}

export async function uploadWithConcurrency(
  files: readonly File[],
  ownerId: string,
  limit = 3,
): Promise<string[]> {
  const output = new Array<string>(files.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, files.length) }, async () => {
    while (cursor < files.length) {
      const index = cursor;
      cursor += 1;
      const file = files[index];
      if (file !== undefined) {
        output[index] = await uploadTemporaryFile(file, ownerId);
      }
    }
  }));
  return output;
}

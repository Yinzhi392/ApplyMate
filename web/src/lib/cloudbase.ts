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

function configuredAuth() {
  if (cloudbaseApp === undefined) {
    throw new Error("Web 测试环境尚未配置，请联系管理员。");
  }
  return cloudbaseApp.auth({ persistence: "local" });
}

export async function hasAuthenticatedIdentity(): Promise<boolean> {
  if (cloudbaseApp === undefined) return false;
  return (await configuredAuth().getLoginState()) !== null;
}

export async function requireAuthenticatedIdentity(): Promise<void> {
  if (!(await hasAuthenticatedIdentity())) {
    throw new Error("请先使用邮箱验证码登录。");
  }
}

export interface EmailOtpChallenge {
  verify(code: string): Promise<void>;
}

export async function requestEmailVerification(email: string): Promise<EmailOtpChallenge> {
  const result = await configuredAuth().signInWithOtp({ email });
  if (result.error != null || typeof result.data?.verifyOtp !== "function") {
    throw new Error(result.error?.message || "验证码发送失败，请稍后重试。");
  }
  const verifyOtp = result.data.verifyOtp;
  return {
    async verify(code: string): Promise<void> {
      const loginResult = await verifyOtp({ token: code });
      if (loginResult.error != null || loginResult.data?.user == null) {
        throw new Error(loginResult.error?.message || "邮箱验证失败，请检查验证码后重试。");
      }
    },
  };
}

export async function signInWithEmailCode(
  verificationCode: string,
  challenge: EmailOtpChallenge,
): Promise<void> {
  await challenge.verify(verificationCode);
}

function safeExtension(name: string): string {
  const match = name.toLowerCase().match(/\.([a-z0-9]{1,8})$/u);
  return match?.[1] ?? "bin";
}

function safeOwnerId(ownerId: string): string {
  if (!/^user_[a-f0-9]{24}$/u.test(ownerId)) {
    throw new Error("当前登录身份无效，请刷新页面后重试。");
  }
  return ownerId;
}

export interface TemporaryUpload {
  accessUrl: string;
  fileId: string;
}

function temporaryAccessUrl(response: unknown, fileId: string): string {
  if (typeof response !== "object" || response === null) return "";
  const list = (response as { fileList?: unknown }).fileList;
  if (!Array.isArray(list)) return "";
  const item = list.find((candidate) => {
    if (typeof candidate !== "object" || candidate === null) return false;
    return (candidate as { fileID?: unknown }).fileID === fileId;
  }) ?? list[0];
  if (typeof item !== "object" || item === null) return "";
  const record = item as { download_url?: unknown; downloadUrl?: unknown; tempFileURL?: unknown };
  const url = record.tempFileURL ?? record.download_url ?? record.downloadUrl;
  return typeof url === "string" && url.startsWith("https://") ? url : "";
}

export async function uploadTemporaryFile(file: File, ownerId: string): Promise<TemporaryUpload> {
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
  try {
    const accessResponse = await cloudbaseApp.getTempFileURL({ fileList: [response.fileID] });
    const accessUrl = temporaryAccessUrl(accessResponse, response.fileID);
    if (accessUrl === "") throw new Error("文件读取授权失败，请重新上传后重试。");
    return { accessUrl, fileId: response.fileID };
  } catch (cause) {
    await cloudbaseApp.deleteFile({ fileList: [response.fileID] }).catch(() => undefined);
    throw cause instanceof Error ? cause : new Error("文件读取授权失败，请重新上传后重试。");
  }
}

export async function uploadWithConcurrency(
  files: readonly File[],
  ownerId: string,
  limit = 3,
): Promise<TemporaryUpload[]> {
  const output = new Array<TemporaryUpload>(files.length);
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

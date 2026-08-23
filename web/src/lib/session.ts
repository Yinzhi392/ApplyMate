import { getCloudbaseApp, requireCloudbaseApp, type CloudbaseAuthClient } from "./cloudbase-app";

async function configuredAuth(): Promise<CloudbaseAuthClient> {
  return (await requireCloudbaseApp()).auth({ persistence: "local" });
}

export async function hasAuthenticatedIdentity(): Promise<boolean> {
  if (import.meta.env.VITE_E2E_MODE === "true") return false;
  const app = await getCloudbaseApp();
  if (app === undefined) return false;
  return (await app.auth({ persistence: "local" }).getLoginState()) !== null;
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
  const result = await (await configuredAuth()).signInWithOtp({ email });
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

export async function signOut(): Promise<void> {
  await (await configuredAuth()).signOut();
}

export interface LoginFlowInput {
  agreementChecked: boolean;
  agreementRequired: boolean;
  inviteCode: string;
  inviteRequired: boolean;
}

export interface LoginFlowDependencies {
  acceptAgreement(): Promise<unknown>;
  activateInvite(code: string): Promise<unknown>;
}

export function isLoginActionDisabled(input: LoginFlowInput): boolean {
  return (
    (input.agreementRequired && !input.agreementChecked) ||
    (input.inviteRequired && input.inviteCode.trim() === "")
  );
}

export class LoginFlowError extends Error {
  constructor(
    public readonly code: "AGREEMENT_REQUIRED" | "INVITE_REQUIRED" | "STEP_FAILED",
    message: string,
    public readonly agreementAccepted: boolean,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "LoginFlowError";
  }
}

export async function submitLoginFlow(
  input: LoginFlowInput,
  dependencies: LoginFlowDependencies,
): Promise<{ agreementAccepted: boolean; activated: boolean }> {
  if (input.agreementRequired && !input.agreementChecked) {
    throw new LoginFlowError(
      "AGREEMENT_REQUIRED",
      "请先阅读并同意用户协议和隐私政策。",
      false,
    );
  }
  if (input.inviteRequired && input.inviteCode.trim() === "") {
    throw new LoginFlowError("INVITE_REQUIRED", "请输入邀请码。", false);
  }

  let agreementAccepted = !input.agreementRequired;
  try {
    if (input.agreementRequired) {
      await dependencies.acceptAgreement();
      agreementAccepted = true;
    }
    if (input.inviteRequired) {
      await dependencies.activateInvite(input.inviteCode.trim());
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "验证失败，请重新尝试。";
    throw new LoginFlowError("STEP_FAILED", message, agreementAccepted, { cause: error });
  }

  return { agreementAccepted, activated: true };
}

export type AccessState =
  | "agreement_required"
  | "invite_required"
  | "active"
  | "disabled";

export interface LoginState {
  accessState: AccessState;
  agreementChecked: boolean;
  inviteRequired: boolean;
  isAdmin: boolean;
  inviteCode: string;
  errorMessage: string;
  justActivated: boolean;
}

export interface LoginView {
  title: string;
  description: string;
  actionLabel: string;
  helperText: string;
  mode: "form" | "success" | "disabled" | "redirect";
  showAgreement: boolean;
  showInviteInput: boolean;
  actionDisabled: boolean;
  errorMessage: string;
}

const LOGIN_COPY: Record<Exclude<AccessState, "active">, Pick<LoginView, "title" | "description" | "actionLabel">> = {
  agreement_required: {
    title: "把真实经历，写进每一次开场",
    description: "确认一次简历，之后提交岗位截图或文字，生成有事实依据的专属开场白。",
    actionLabel: "验证并登录",
  },
  invite_required: {
    title: "把真实经历，写进每一次开场",
    description: "邀请码验证成功后，即可开始确认简历。",
    actionLabel: "验证并登录",
  },
  disabled: {
    title: "账号已停用",
    description: "当前账号不能继续使用业务功能，你仍可申请删除数据。",
    actionLabel: "删除账号",
  },
};

export function createLoginView(state: LoginState): LoginView {
  const mode = state.accessState === "active"
    ? state.justActivated ? "success" : "redirect"
    : state.accessState === "disabled" ? "disabled" : "form";
  const copy = state.accessState === "active"
    ? {
        title: "验证成功",
        description: "账号已激活。先确认一份简历，就可以开始生成专属开场白。",
        actionLabel: "开始使用",
      }
    : LOGIN_COPY[state.accessState];
  const showInviteInput = mode === "form" && state.inviteRequired && !state.isAdmin;
  const showAgreement = mode === "form" && state.accessState === "agreement_required";
  return {
    ...copy,
    helperText: state.isAdmin
      ? "管理员已通过服务端白名单识别，无需邀请码。"
      : "微信身份只由服务端运行环境识别。",
    mode,
    showAgreement,
    showInviteInput,
    actionDisabled:
      (showAgreement && !state.agreementChecked) ||
      (showInviteInput && state.inviteCode.trim() === ""),
    errorMessage: state.errorMessage,
  };
}

export interface HomeResumeSummary {
  resumeId: string;
  name: string;
}

export interface HomeState {
  defaultResume: HomeResumeSummary | null;
  remainingQuota: number;
  resourcePauseReason: string;
}

export interface HomeView extends HomeState {
  primaryActionDescription: string;
  primaryActionLabel: string;
  generationEnabled: boolean;
  pauseTitle: string;
  pauseDescription: string;
}

export function createHomeView(state: HomeState): HomeView {
  const noResume = state.defaultResume === null;
  const quotaExhausted = state.remainingQuota <= 0;
  const resourcePaused = state.resourcePauseReason.trim() !== "";
  const generationEnabled = !noResume && !quotaExhausted && !resourcePaused;

  let pauseTitle = "";
  let pauseDescription = "";
  if (resourcePaused) {
    pauseTitle = "AI 服务暂不可用";
    pauseDescription = state.resourcePauseReason;
  } else if (quotaExhausted) {
    pauseTitle = "今日次数已用完";
    pauseDescription = "额度将在北京时间次日恢复。";
  }

  return {
    ...state,
    primaryActionLabel: noResume ? "先添加简历" : "提交岗位信息",
    primaryActionDescription: noResume
      ? "上传后只需核对一次个人资料"
      : "添加最多 5 张截图，或直接粘贴岗位文字",
    generationEnabled,
    pauseTitle,
    pauseDescription,
  };
}

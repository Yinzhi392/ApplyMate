export type AccessState =
  | "agreement_required"
  | "invite_required"
  | "active"
  | "disabled";

export interface LoginState {
  accessState: AccessState;
  agreementChecked: boolean;
  isAdmin: boolean;
  inviteCode: string;
  errorMessage: string;
}

export interface LoginView {
  title: string;
  description: string;
  actionLabel: string;
  helperText: string;
  showAgreement: boolean;
  showInviteInput: boolean;
  actionDisabled: boolean;
  errorMessage: string;
}

const LOGIN_COPY: Record<AccessState, Pick<LoginView, "title" | "description" | "actionLabel">> = {
  agreement_required: {
    title: "请先阅读并同意协议",
    description: "确认数据处理范围后，再开始使用投了吗。",
    actionLabel: "同意并继续",
  },
  invite_required: {
    title: "输入邀请码",
    description: "邀请制内测只向已激活用户开放。",
    actionLabel: "激活邀请码",
  },
  active: {
    title: "登录成功",
    description: "准备好简历后，就可以为岗位生成专属开场白。",
    actionLabel: "进入首页",
  },
  disabled: {
    title: "账号已停用",
    description: "当前账号不能继续使用业务功能，你仍可申请删除数据。",
    actionLabel: "删除账号",
  },
};

export function createLoginView(state: LoginState): LoginView {
  const copy = LOGIN_COPY[state.accessState];
  return {
    ...copy,
    helperText: state.isAdmin
      ? "管理员已通过服务端白名单识别，无需邀请码。"
      : "微信身份只由服务端运行环境识别。",
    showAgreement: state.accessState === "agreement_required",
    showInviteInput: state.accessState === "invite_required" && !state.isAdmin,
    actionDisabled:
      (state.accessState === "agreement_required" && !state.agreementChecked) ||
      (state.accessState === "invite_required" && state.inviteCode.trim() === ""),
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
    primaryActionLabel: noResume ? "先添加简历" : "上传岗位 JD",
    generationEnabled,
    pauseTitle,
    pauseDescription,
  };
}

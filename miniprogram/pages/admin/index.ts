import { messageFrom, showSuccess } from "../../services/page-utils.js";
import { runtime } from "../../services/runtime.js";

type TextInputEvent = WechatMiniprogram.CustomEvent<{ value: string }>;

interface RateMetric {
  numerator: number;
  denominator: number;
  rate: number | null;
}

const METRIC_LABELS = [
  ["firstResumeConfirmationRate", "首份简历确认率"],
  ["generationSuccessRate", "生成成功率"],
  ["copyRate", "复制率"],
  ["satisfactionRate", "满意率"],
  ["sevenDayReturnRate", "7 日回访率"],
] as const;

function formatProductMetrics(
  metrics: Partial<Record<(typeof METRIC_LABELS)[number][0], RateMetric>> = {},
): Array<{ label: string; value: string; counts: string }> {
  return METRIC_LABELS.map(([key, label]) => {
    const metric = metrics[key] ?? { numerator: 0, denominator: 0, rate: null };
    return {
      label,
      value: metric.rate === null ? "—" : `${Math.round(metric.rate * 100)}%`,
      counts: `${metric.numerator} / ${metric.denominator}`,
    };
  });
}

Page({
  data: {
    authorized: false,
    errorMessage: "",
    inviteActive: 0,
    inviteCode: "",
    inviteId: "",
    loading: true,
    quotaIncrease: "1",
    reason: "",
    productMetrics: formatProductMetrics(),
    targetUserId: "",
    usageSucceeded: 0,
    userTotal: 0,
  },

  onLoad(): void {
    void this.loadAdmin();
  },

  async loadAdmin(): Promise<void> {
    this.setData({ errorMessage: "", loading: true });
    try {
      const auth = await runtime().api.read<{ isAdmin: boolean }>("auth.status", {});
      if (!auth.isAdmin) {
        this.setData({ authorized: false, errorMessage: "无权访问管理员功能。", loading: false });
        return;
      }
      const stats = await runtime().api.read<{
        dailyUsage?: { succeeded: number };
        invitations: { active: number };
        productMetrics?: Partial<
          Record<(typeof METRIC_LABELS)[number][0], RateMetric>
        >;
        quota?: { succeeded: number };
        users: { total: number };
      }>("admin.stats", {});
      this.setData({
        authorized: true,
        inviteActive: stats.invitations.active,
        loading: false,
        productMetrics: formatProductMetrics(stats.productMetrics),
        usageSucceeded:
          stats.dailyUsage?.succeeded ?? stats.quota?.succeeded ?? 0,
        userTotal: stats.users.total,
      });
    } catch (error) {
      this.setData({ authorized: false, errorMessage: messageFrom(error), loading: false });
    }
  },

  updateTargetUserId(event: TextInputEvent): void {
    this.setData({ targetUserId: event.detail.value });
  },

  updateQuota(event: TextInputEvent): void {
    this.setData({ quotaIncrease: event.detail.value });
  },

  updateReason(event: TextInputEvent): void {
    this.setData({ reason: event.detail.value });
  },

  async createInvite(): Promise<void> {
    try {
      const result = await runtime().api.write<{ code: string; inviteId: string }>(
        "admin.inviteCreate",
        {},
      );
      this.setData({ inviteCode: result.code, inviteId: result.inviteId });
    } catch (error) {
      this.setData({ errorMessage: messageFrom(error) });
    }
  },

  async revokeInvite(): Promise<void> {
    try {
      await runtime().api.write("admin.inviteRevoke", { inviteId: this.data.inviteId });
      this.setData({ inviteCode: "", inviteId: "" });
      showSuccess("邀请码已撤销");
    } catch (error) {
      this.setData({ errorMessage: messageFrom(error) });
    }
  },

  async increaseQuota(): Promise<void> {
    if (this.data.targetUserId.trim() === "" || this.data.reason.trim() === "") {
      this.setData({ errorMessage: "请输入目标用户和审计原因。" });
      return;
    }
    try {
      await runtime().api.write("admin.quotaAdjust", {
        increase: Number(this.data.quotaIncrease),
        reason: this.data.reason,
        targetUserId: this.data.targetUserId,
      });
      showSuccess("当日额度已增加");
    } catch (error) {
      this.setData({ errorMessage: messageFrom(error) });
    }
  },

  async setUserEnabled(event: WechatMiniprogram.BaseEvent): Promise<void> {
    if (this.data.targetUserId.trim() === "" || this.data.reason.trim() === "") {
      this.setData({ errorMessage: "请输入目标用户和审计原因。" });
      return;
    }
    try {
      await runtime().api.write("admin.userSetEnabled", {
        enabled: String(event.currentTarget.dataset.enabled) === "true",
        reason: this.data.reason,
        targetUserId: this.data.targetUserId,
      });
      showSuccess("用户状态已更新");
    } catch (error) {
      this.setData({ errorMessage: messageFrom(error) });
    }
  },
});

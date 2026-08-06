import { createHomeView } from "../../core/presenters.js";
import {
  isWeakNetwork,
  messageFrom,
  openPage,
  replaceWithLogin,
} from "../../services/page-utils.js";
import { runtime } from "../../services/runtime.js";

interface ResumeSummary {
  isDefault: boolean;
  profile: { name?: string };
  resumeId: string;
  status: string;
}

interface ApplicationSummary {
  applicationId: string;
  jdSnapshot: {
    companyName?: { text: string };
    jobTitle?: { text: string };
  };
  status: "not_applied" | "applied";
  updatedAt: string;
}

Page({
  data: {
    defaultResumeName: "还未添加简历",
    emptyRecentRecords: true,
    errorMessage: "",
    generationEnabled: false,
    loading: true,
    pauseDescription: "",
    pauseTitle: "",
    primaryActionLabel: "先添加简历",
    recentApplications: [] as Array<{
      applicationId: string;
      companyName: string;
      jobTitle: string;
      statusLabel: string;
    }>,
    remainingQuota: 0,
    weakNetwork: false,
  },

  onShow(): void {
    void this.loadHome();
  },

  async loadHome(): Promise<void> {
    this.setData({ errorMessage: "", loading: true, weakNetwork: false });
    try {
      const [userResponse, resumeResponse, applicationResponse] = await Promise.all([
        runtime().api.read<{
          accessState: string;
          user: { remainingQuota: number; resourcePauseReason: string };
        }>("user.get", {}),
        runtime().api.read<{ resumes: ResumeSummary[] }>("resume.list", {}),
        runtime().api.read<{ applications: ApplicationSummary[] }>("application.list", {}),
      ]);
      if (userResponse.accessState !== "active") {
        replaceWithLogin();
        return;
      }
      const defaultResume = resumeResponse.resumes.find(
        ({ isDefault, status }) => isDefault && status === "confirmed",
      );
      const recentApplications = applicationResponse.applications.slice(0, 3).map((application) => ({
        applicationId: application.applicationId,
        companyName: application.jdSnapshot.companyName?.text ?? "贵司",
        jobTitle: application.jdSnapshot.jobTitle?.text ?? "岗位名称待核对",
        status: application.status,
        statusLabel: application.status === "applied" ? "已投递" : "未投递",
        updatedAt: application.updatedAt,
      }));
      const view = createHomeView({
        defaultResume: defaultResume === undefined
          ? null
          : {
              name: defaultResume.profile.name ?? "已确认简历",
              resumeId: defaultResume.resumeId,
            },
        recentApplications,
        remainingQuota: userResponse.user.remainingQuota,
        resourcePauseReason: userResponse.user.resourcePauseReason,
      });
      this.setData({
        defaultResumeName: view.defaultResume?.name ?? "还未添加简历",
        emptyRecentRecords: view.emptyRecentRecords,
        generationEnabled: view.generationEnabled,
        loading: false,
        pauseDescription: view.pauseDescription,
        pauseTitle: view.pauseTitle,
        primaryActionLabel: view.primaryActionLabel,
        recentApplications: recentApplications.map(({ status: _status, updatedAt: _updatedAt, ...item }) => item),
        remainingQuota: view.remainingQuota,
      });
    } catch (error) {
      this.setData({
        errorMessage: messageFrom(error),
        loading: false,
        weakNetwork: isWeakNetwork(error),
      });
    }
  },

  openResumes(): void {
    openPage("/pages/resumes/index");
  },

  openGeneration(): void {
    if (this.data.primaryActionLabel === "先添加简历") {
      openPage("/pages/resume-upload/index");
      return;
    }
    openPage("/pages/generation/index");
  },

  openApplication(event: WechatMiniprogram.BaseEvent): void {
    const applicationId = String(event.currentTarget.dataset.applicationId ?? "");
    openPage(`/pages/application-detail/index?applicationId=${applicationId}`);
  },
});

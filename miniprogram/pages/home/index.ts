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

Page({
  data: {
    defaultResumeName: "还未添加简历",
    errorMessage: "",
    generationEnabled: false,
    loading: true,
    pauseDescription: "",
    pauseTitle: "",
    primaryActionLabel: "先添加简历",
    remainingQuota: 0,
    weakNetwork: false,
  },

  onShow(): void {
    void this.loadHome();
  },

  async loadHome(): Promise<void> {
    this.setData({ errorMessage: "", loading: true, weakNetwork: false });
    try {
      const [userResponse, resumeResponse] = await Promise.all([
        runtime().api.read<{
          accessState: string;
          user: { remainingQuota: number; resourcePauseReason: string };
        }>("user.get", {}),
        runtime().api.read<{ resumes: ResumeSummary[] }>("resume.list", {}),
      ]);
      if (userResponse.accessState !== "active") {
        replaceWithLogin();
        return;
      }
      const defaultResume = resumeResponse.resumes.find(
        ({ isDefault, status }) => isDefault && status === "confirmed",
      );
      const view = createHomeView({
        defaultResume: defaultResume === undefined
          ? null
          : {
              name: defaultResume.profile.name ?? "已确认简历",
              resumeId: defaultResume.resumeId,
            },
        remainingQuota: userResponse.user.remainingQuota,
        resourcePauseReason: userResponse.user.resourcePauseReason,
      });
      this.setData({
        defaultResumeName: view.defaultResume?.name ?? "还未添加简历",
        generationEnabled: view.generationEnabled,
        loading: false,
        pauseDescription: view.pauseDescription,
        pauseTitle: view.pauseTitle,
        primaryActionLabel: view.primaryActionLabel,
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
});

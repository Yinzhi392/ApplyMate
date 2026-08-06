import { messageFrom, openPage } from "../../services/page-utils.js";
import { runtime } from "../../services/runtime.js";

type TextInputEvent = WechatMiniprogram.CustomEvent<{ value: string }>;

interface JobField {
  confidence: number;
  fieldId: string;
  text: string;
}

interface JobDescription {
  availabilityDuration: JobField[];
  companyName?: JobField;
  experienceEducation: JobField[];
  hardSkills: JobField[];
  jobTitle?: JobField;
  locationWorkMode: JobField[];
  responsibilities: JobField[];
}

Page({
  data: {
    companyName: "",
    errorMessage: "",
    jobDescription: null as JobDescription | null,
    jobId: "",
    jobTitle: "",
    loading: true,
    responsibilities: "",
  },

  onLoad(options: Record<string, string | undefined>): void {
    this.setData({ jobId: options.jobId ?? runtime().getLastJobId() });
    void this.loadJob();
  },

  async loadJob(): Promise<void> {
    this.setData({ errorMessage: "", loading: true });
    try {
      const job = await runtime().api.read<{
        result?: { jobDescription?: JobDescription };
      }>("job.get", { jobId: this.data.jobId });
      const jobDescription = job.result?.jobDescription;
      if (jobDescription === undefined) {
        this.setData({ errorMessage: "没有可确认的岗位内容。", loading: false });
        return;
      }
      this.setData({
        companyName: jobDescription.companyName?.text ?? "",
        jobDescription,
        jobTitle: jobDescription.jobTitle?.text ?? "",
        loading: false,
        responsibilities: jobDescription.responsibilities.map(({ text }) => text).join("\n"),
      });
    } catch (error) {
      this.setData({ errorMessage: messageFrom(error), loading: false });
    }
  },

  updateJobTitle(event: TextInputEvent): void {
    this.setData({ jobTitle: event.detail.value });
  },

  updateCompanyName(event: TextInputEvent): void {
    this.setData({ companyName: event.detail.value });
  },

  updateResponsibilities(event: TextInputEvent): void {
    this.setData({ responsibilities: event.detail.value });
  },

  async confirm(): Promise<void> {
    const original = this.data.jobDescription;
    if (original === null || this.data.jobTitle.trim() === "") {
      this.setData({ errorMessage: "岗位名不能为空。" });
      return;
    }
    const responsibilities = this.data.responsibilities
      .split(/\n+/gu)
      .map((text) => text.trim())
      .filter((text) => text !== "")
      .map((text, index) => ({ confidence: 1, fieldId: `jd_responsibility_${index + 1}`, text }));
    const jobDescription: JobDescription = {
      ...original,
      jobTitle: { confidence: 1, fieldId: "jd_job_title", text: this.data.jobTitle.trim() },
      responsibilities,
    };
    if (this.data.companyName.trim() === "") {
      delete jobDescription.companyName;
    } else {
      jobDescription.companyName = {
        confidence: 1,
        fieldId: "jd_company_name",
        text: this.data.companyName.trim(),
      };
    }
    this.setData({ errorMessage: "", loading: true });
    try {
      await runtime().api.write("generation.confirmJd", {
        jobDescription,
        jobId: this.data.jobId,
      });
      this.setData({ loading: false });
      openPage(`/pages/job/index?jobId=${this.data.jobId}`);
    } catch (error) {
      this.setData({ errorMessage: messageFrom(error), loading: false });
    }
  },
});

import { messageFrom, switchHome } from "../../services/page-utils.js";
import { runtime } from "../../services/runtime.js";

type TextInputEvent = WechatMiniprogram.CustomEvent<{ value: string }>;

interface FactItem {
  factId: string;
  sourceType: string;
  text: string;
  [key: string]: unknown;
}

interface EditableProfile {
  achievements: FactItem[];
  certificates: FactItem[];
  confirmed: boolean;
  education: FactItem[];
  experiences: FactItem[];
  languages: FactItem[];
  name?: string;
  otherFacts: FactItem[];
  preferences: FactItem[];
  projects: FactItem[];
  resumeId: string;
  skills: FactItem[];
}

const SECTIONS = [
  ["education", "教育"],
  ["experiences", "经历"],
  ["projects", "项目"],
  ["skills", "技能"],
  ["languages", "语言"],
  ["certificates", "证书"],
  ["achievements", "成果"],
  ["preferences", "偏好"],
  ["otherFacts", "其他"],
] as const;

function flattenFacts(profile: EditableProfile): Array<FactItem & {
  index: number;
  key: string;
  label: string;
  section: keyof EditableProfile;
}> {
  return SECTIONS.flatMap(([section, label]) => profile[section].map((fact, index) => ({
    ...fact,
    index,
    key: `${section}:${fact.factId}`,
    label,
    section,
  })));
}

Page({
  data: {
    errorMessage: "",
    facts: [] as ReturnType<typeof flattenFacts>,
    jobId: "",
    loading: true,
    profile: null as EditableProfile | null,
    profileName: "",
  },

  onLoad(options: Record<string, string | undefined>): void {
    const jobId = options.jobId ?? runtime().getLastJobId();
    this.setData({ jobId });
    void this.loadProfile();
  },

  async loadProfile(): Promise<void> {
    if (this.data.jobId === "") {
      this.setData({ errorMessage: "找不到解析任务，请重新上传简历。", loading: false });
      return;
    }
    this.setData({ errorMessage: "", loading: true });
    try {
      const job = await runtime().api.read<{
        result?: { profile?: EditableProfile };
      }>("job.get", { jobId: this.data.jobId });
      const profile = job.result?.profile;
      if (profile === undefined) {
        this.setData({ errorMessage: "解析结果尚未准备好。", loading: false });
        return;
      }
      this.setData({
        facts: flattenFacts(profile),
        loading: false,
        profile,
        profileName: profile.name ?? "",
      });
    } catch (error) {
      this.setData({ errorMessage: messageFrom(error), loading: false });
    }
  },

  updateName(event: TextInputEvent): void {
    const profile = this.data.profile;
    if (profile === null) {
      return;
    }
    profile.name = event.detail.value;
    this.setData({ profile, profileName: event.detail.value });
  },

  updateFact(event: TextInputEvent): void {
    const profile = this.data.profile;
    const section = String(event.currentTarget.dataset.section) as keyof EditableProfile;
    const index = Number(event.currentTarget.dataset.index);
    if (profile === null || !Array.isArray(profile[section])) {
      return;
    }
    const entries = profile[section] as FactItem[];
    const fact = entries[index];
    if (fact === undefined) {
      return;
    }
    fact.text = event.detail.value;
    this.setData({ facts: flattenFacts(profile), profile });
  },

  async confirm(): Promise<void> {
    if (this.data.profile === null) {
      return;
    }
    this.setData({ errorMessage: "", loading: true });
    try {
      await runtime().api.write("resume.confirm", {
        profile: this.data.profile,
        resumeId: this.data.profile.resumeId,
      });
      await wx.showToast({ title: "简历已确认", icon: "success" });
      switchHome();
    } catch (error) {
      this.setData({ errorMessage: messageFrom(error), loading: false });
    }
  },
});

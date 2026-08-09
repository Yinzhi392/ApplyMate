interface ResumeFact {
  factId: string;
  text: string;
}

export interface ReviewableResumeProfile {
  achievements: ResumeFact[];
  certificates: ResumeFact[];
  education: ResumeFact[];
  experiences: ResumeFact[];
  languages: ResumeFact[];
  otherFacts: ResumeFact[];
  preferences: ResumeFact[];
  projects: ResumeFact[];
  skills: ResumeFact[];
}

export interface ResumeReviewFact {
  factId: string;
  index: number;
  key: string;
  label: string;
  needsReview: boolean;
  section: ReviewSection;
  text: string;
}

export interface ResumeStrength {
  label: string;
  text: string;
  weight: number;
}

export interface ResumeWeight {
  count: number;
  label: string;
  note: string;
  weight: number;
}

const SECTION_LABELS = [
  ["education", "教育背景"],
  ["experiences", "实习 / 工作经历 💼"],
  ["projects", "项目经历 🚀"],
  ["skills", "专业技能与工具 🛠️"],
  ["languages", "语言能力"],
  ["certificates", "证书"],
  ["achievements", "量化成果"],
  ["preferences", "求职偏好"],
  ["otherFacts", "其他事实"],
] as const;

type ReviewSection = (typeof SECTION_LABELS)[number][0];

function factsIn(profile: ReviewableResumeProfile, sections: readonly ReviewSection[]): ResumeFact[] {
  return sections.flatMap((section) => {
    const value = profile[section];
    return Array.isArray(value) ? value as ResumeFact[] : [];
  });
}

function firstFact(profile: ReviewableResumeProfile, sections: readonly ReviewSection[]): ResumeFact | undefined {
  return factsIn(profile, sections)[0];
}

export function createResumeReview(
  profile: ReviewableResumeProfile,
  reviewFactIds: readonly string[],
): {
  confirmedFacts: ResumeReviewFact[];
  needsReview: ResumeReviewFact[];
  strengths: ResumeStrength[];
  weights: ResumeWeight[];
} {
  const reviewIds = new Set(reviewFactIds);
  const facts = SECTION_LABELS.flatMap(([section, label]) => {
    const entries = profile[section] as ResumeFact[];
    return entries.map((fact, index): ResumeReviewFact => ({
      factId: fact.factId,
      index,
      key: `${section}:${fact.factId}`,
      label,
      needsReview: reviewIds.has(fact.factId),
      section,
      text: fact.text,
    }));
  });

  const experience = firstFact(profile, ["experiences"]);
  const project = firstFact(profile, ["projects", "achievements"]);
  const skill = firstFact(profile, ["skills"]);
  const education = firstFact(profile, ["education"]);
  const credential = firstFact(profile, ["certificates", "languages"]);
  const candidates: Array<ResumeStrength | null> = [
    experience === undefined ? null : { label: "相关实习 / 工作经历 💼", text: experience.text, weight: 25 },
    project === undefined ? null : { label: "项目与量化成果 🚀", text: project.text, weight: 25 },
    skill === undefined ? null : { label: "专业技能与工具 🛠️", text: skill.text, weight: 20 },
    education === undefined ? null : { label: "教育背景", text: education.text, weight: 8 },
    credential === undefined ? null : { label: "证书与语言", text: credential.text, weight: 5 },
  ];
  const strengths = candidates
    .filter((candidate): candidate is ResumeStrength => candidate !== null)
    .sort((left, right) => right.weight - left.weight)
    .slice(0, 3);

  const abilityEvidenceCount = factsIn(profile, ["experiences", "projects", "achievements"])
    .filter(({ text }) => /负责|完成|推动|协作|分析|解决|提升|增长|降低|访谈/u.test(text)).length;
  const gpaCount = facts.filter(({ text }) => /GPA|绩点|均分/u.test(text)).length;
  const weights: ResumeWeight[] = [
    { label: "相关实习 / 工作经历 💼", weight: 25, count: profile.experiences.length, note: "与岗位职责直接相关时优先" },
    { label: "相关项目与量化成果 🚀", weight: 25, count: profile.projects.length + profile.achievements.length, note: "优先使用可验证的结果" },
    { label: "专业技能与工具 🛠️", weight: 20, count: profile.skills.length, note: "只展示简历中明确出现的技能" },
    { label: "有经历支撑的个人能力", weight: 15, count: abilityEvidenceCount, note: "不生成无证据的自我评价" },
    { label: "教育背景与专业匹配", weight: 8, count: profile.education.length, note: "学历硬条件会单独核对" },
    { label: "证书、语言、奖项与领导经历", weight: 5, count: profile.certificates.length + profile.languages.length, note: "按岗位要求调整" },
    { label: "GPA / 均分", weight: 2, count: gpaCount, note: "金融、咨询、量化、研究类岗位可提高" },
  ];

  return {
    confirmedFacts: facts.filter(({ needsReview }) => !needsReview),
    needsReview: facts.filter(({ needsReview }) => needsReview),
    strengths,
    weights,
  };
}

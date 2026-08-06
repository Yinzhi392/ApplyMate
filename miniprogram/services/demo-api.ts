import { createPreferenceDraft } from "../core/input-rules.js";
import {
  ApiClientError,
  type ApiClient,
  type ClientApiAction,
} from "./api-client.js";

const AI_COPY_LABEL = "AI生成内容，请核对真实性";
const AGREEMENT_VERSION = "mvp-1";
const DEMO_INVITE_CODE = "APPLYMATE";

interface DemoOptions {
  isAdmin?: boolean;
  activated?: boolean;
  withConfirmedResume?: boolean;
}

type AccessState = "agreement_required" | "invite_required" | "active" | "disabled";

interface DemoFact {
  factId: string;
  sourceType: string;
  text: string;
  factHash: string;
  [key: string]: unknown;
}

interface DemoProfile {
  resumeId: string;
  name?: string;
  education: DemoFact[];
  experiences: DemoFact[];
  projects: DemoFact[];
  skills: DemoFact[];
  languages: DemoFact[];
  certificates: DemoFact[];
  achievements: DemoFact[];
  preferences: DemoFact[];
  otherFacts: DemoFact[];
  confirmed: boolean;
}

interface DemoResume {
  resumeId: string;
  jobId: string;
  inputType: "text" | "pdf" | "docx" | "images";
  status: "awaiting_confirmation" | "confirmed";
  profile: DemoProfile;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  confirmedAt?: string;
}

interface DemoField {
  fieldId: string;
  text: string;
  confidence: number;
}

interface DemoJobDescription {
  jobTitle?: DemoField;
  companyName?: DemoField;
  responsibilities: DemoField[];
  hardSkills: DemoField[];
  experienceEducation: DemoField[];
  locationWorkMode: DemoField[];
  availabilityDuration: DemoField[];
}

interface DemoClaim {
  claimId: string;
  text: string;
  sources: Array<
    | { type: "fact"; factId: string }
    | { type: "jd"; fieldId: string }
  >;
}

interface DemoApplication {
  applicationId: string;
  jobId: string;
  resumeId: string;
  status: "not_applied" | "applied";
  greetingBody: string;
  memo?: string;
  manualWarnings: Array<{ code: string; message: string }>;
  evidence: DemoClaim[];
  factSnapshot: Array<{ factId: string; sourceType: string; text: string }>;
  jdSnapshot: DemoJobDescription;
  omittedRequirements: string[];
  warnings: string[];
  createdAt: string;
  updatedAt: string;
}

interface DemoFeedback {
  applicationId: string;
  rating: "satisfied" | "needs_improvement";
  note?: string;
  createdAt: string;
  updatedAt: string;
}

interface DemoJob {
  jobId: string;
  kind: "resume_parse" | "greeting_generate" | "greeting_rewrite";
  status:
    | "queued"
    | "ocr"
    | "parsing"
    | "awaiting_user_confirmation"
    | "generating"
    | "validating"
    | "succeeded"
    | "failed";
  statusLabel: string;
  result?: Record<string, unknown>;
  error?: { code: string; message: string; retryable: boolean };
  createdAt: string;
  updatedAt: string;
}

interface DemoState {
  isAdmin: boolean;
  accountStatus: "enabled" | "disabled";
  agreementsAccepted: boolean;
  activated: boolean;
  preferenceText: string;
  preferenceFacts: DemoFact[];
  resumes: DemoResume[];
  jobs: DemoJob[];
  applications: DemoApplication[];
  feedback: DemoFeedback[];
  succeededUsage: number;
  resourcePauseReason: string;
  deletionToken?: string;
  nextId: number;
}

const STATUS_LABELS: Record<DemoJob["status"], string> = {
  queued: "排队",
  ocr: "OCR",
  parsing: "解析",
  awaiting_user_confirmation: "等待用户确认",
  generating: "生成",
  validating: "校验",
  succeeded: "成功",
  failed: "失败",
};

function now(): string {
  return new Date().toISOString();
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function requiredString(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new ApiClientError("INVALID_REQUEST", `缺少字段：${key}。`, false);
  }
  return value.trim();
}

function factHash(seed: string): string {
  const code = Array.from(seed).reduce((sum, character) => sum + character.codePointAt(0)!, 0);
  return code.toString(16).padStart(64, "0").slice(-64);
}

function factId(seed: string): string {
  return `fact_${factHash(seed).slice(-24)}`;
}

function accessState(state: DemoState): AccessState {
  if (state.accountStatus === "disabled") {
    return "disabled";
  }
  if (!state.agreementsAccepted) {
    return "agreement_required";
  }
  if (!state.isAdmin && !state.activated) {
    return "invite_required";
  }
  return "active";
}

function assertActive(state: DemoState): void {
  const access = accessState(state);
  if (access === "agreement_required") {
    throw new ApiClientError("AGREEMENT_REQUIRED", "请先同意当前版本协议。", false);
  }
  if (access === "invite_required") {
    throw new ApiClientError("INVITE_REQUIRED", "请先使用邀请码激活。", false);
  }
  if (access === "disabled") {
    throw new ApiClientError("FORBIDDEN", "账号已停用。", false);
  }
}

function assertAdmin(state: DemoState): void {
  assertActive(state);
  if (!state.isAdmin) {
    throw new ApiClientError("FORBIDDEN", "无权访问管理员功能。", false);
  }
}

function nextId(state: DemoState, prefix: string): string {
  state.nextId += 1;
  return `${prefix}_${state.nextId.toString().padStart(8, "0")}`;
}

function createProfile(resumeId: string, sourceText: string): DemoProfile {
  const projectText = sourceText.trim() || "完成校园 AI 助手项目";
  return {
    resumeId,
    name: "林晓",
    education: [{
      factId: factId("education-demo"),
      sourceType: "education",
      text: "就读于示例大学产品设计专业",
      factHash: factHash("education-demo"),
      school: "示例大学",
      major: "产品设计",
    }],
    experiences: [{
      factId: factId("experience-demo"),
      sourceType: "experience",
      text: "参与产品需求整理与用户反馈分析",
      factHash: factHash("experience-demo"),
      organization: "示例团队",
      role: "产品实习生",
    }],
    projects: [{
      factId: factId(projectText),
      sourceType: "project",
      text: projectText,
      factHash: factHash(projectText),
      name: "校园 AI 助手",
    }],
    skills: [{
      factId: factId("skill-prototype"),
      sourceType: "skill",
      text: "能够完成原型设计和需求文档整理",
      factHash: factHash("skill-prototype"),
      name: "原型与需求文档",
    }],
    languages: [],
    certificates: [],
    achievements: [],
    preferences: [],
    otherFacts: [],
    confirmed: false,
  };
}

function defaultJobDescription(): DemoJobDescription {
  return {
    jobTitle: { fieldId: "jd_job_title", text: "AI 产品实习生", confidence: 0.98 },
    responsibilities: [{
      fieldId: "jd_responsibility",
      text: "负责产品需求分析和用户反馈整理",
      confidence: 0.95,
    }],
    hardSkills: [{ fieldId: "jd_skill", text: "原型设计", confidence: 0.92 }],
    experienceEducation: [],
    locationWorkMode: [{ fieldId: "jd_work_mode", text: "支持远程", confidence: 0.9 }],
    availabilityDuration: [],
  };
}

function demoGreeting(companyDisplayName: string): string {
  return `您好，我想应聘${companyDisplayName}的 AI 产品实习生岗位。我目前就读于示例大学产品设计专业，曾参与产品需求整理、用户反馈分析和原型设计，也完成过校园 AI 助手项目。项目中我负责梳理使用场景、拆分需求并跟进功能验证，这些经历与岗位强调的需求分析和协作能力较为匹配。\n\n我可以根据团队目标快速整理信息并持续迭代方案，也愿意主动补齐业务知识。如果岗位支持远程协作，我能够保持稳定沟通和进度同步。以上内容均来自已确认简历与求职偏好，希望有机会进一步了解岗位安排，谢谢。`;
}

function createApplication(
  state: DemoState,
  job: DemoJob,
  resume: DemoResume,
  jdSnapshot: DemoJobDescription,
): DemoApplication {
  const applicationId = nextId(state, "application");
  const timestamp = now();
  const companyDisplayName = jdSnapshot.companyName?.text ?? "贵司";
  const firstProject = resume.profile.projects[0];
  const firstResponsibility = jdSnapshot.responsibilities[0];
  const evidence: DemoClaim[] = [];
  if (firstProject !== undefined && firstResponsibility !== undefined) {
    evidence.push({
      claimId: "claim_project_match",
      text: "完成过校园 AI 助手项目，并具备需求分析经验。",
      sources: [
        { type: "fact", factId: firstProject.factId },
        { type: "jd", fieldId: firstResponsibility.fieldId },
      ],
    });
  }
  const application: DemoApplication = {
    applicationId,
    jobId: job.jobId,
    resumeId: resume.resumeId,
    status: "not_applied",
    greetingBody: demoGreeting(companyDisplayName),
    manualWarnings: [],
    evidence,
    factSnapshot: [
      ...resume.profile.education,
      ...resume.profile.experiences,
      ...resume.profile.projects,
      ...resume.profile.skills,
    ].map(({ factId: id, sourceType, text }) => ({ factId: id, sourceType, text })),
    jdSnapshot,
    omittedRequirements: ["岗位要求中的商业化经验未写入正文"],
    warnings: jdSnapshot.companyName === undefined ? ["COMPANY_NAME_MISSING"] : [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  state.applications.unshift(application);
  state.succeededUsage += 1;
  job.status = "succeeded";
  job.statusLabel = STATUS_LABELS.succeeded;
  job.updatedAt = timestamp;
  job.result = { applicationId, application: clone(application) };
  return application;
}

function createInitialState(options: DemoOptions): DemoState {
  const state: DemoState = {
    isAdmin: options.isAdmin ?? false,
    accountStatus: "enabled",
    agreementsAccepted: options.activated ?? false,
    activated: options.activated ?? false,
    preferenceText: "",
    preferenceFacts: [],
    resumes: [],
    jobs: [],
    applications: [],
    feedback: [],
    succeededUsage: 0,
    resourcePauseReason: "",
    nextId: 0,
  };
  if (options.withConfirmedResume) {
    const timestamp = now();
    const profile = createProfile("resume_demo0001", "完成校园 AI 助手项目");
    profile.confirmed = true;
    state.resumes.push({
      resumeId: profile.resumeId,
      jobId: "job_resume_demo",
      inputType: "text",
      status: "confirmed",
      profile,
      isDefault: true,
      createdAt: timestamp,
      updatedAt: timestamp,
      confirmedAt: timestamp,
    });
  }
  return state;
}

export function createDemoApiClient(options: DemoOptions = {}): ApiClient {
  const state = createInitialState(options);

  function getJob(payload: Record<string, unknown>): DemoJob {
    const jobId = requiredString(payload, "jobId");
    const job = state.jobs.find((candidate) => candidate.jobId === jobId);
    if (job === undefined) {
      throw new ApiClientError("NOT_FOUND", "任务不存在。", false);
    }
    return job;
  }

  function getResume(payload: Record<string, unknown>): DemoResume {
    const resumeId = requiredString(payload, "resumeId");
    const resume = state.resumes.find((candidate) => candidate.resumeId === resumeId);
    if (resume === undefined) {
      throw new ApiClientError("NOT_FOUND", "简历不存在。", false);
    }
    return resume;
  }

  function getApplication(payload: Record<string, unknown>): DemoApplication {
    const applicationId = requiredString(payload, "applicationId");
    const application = state.applications.find(
      (candidate) => candidate.applicationId === applicationId,
    );
    if (application === undefined) {
      throw new ApiClientError("NOT_FOUND", "投递记录不存在。", false);
    }
    return application;
  }

  async function read<T>(action: ClientApiAction, payload: Record<string, unknown>): Promise<T> {
    if (action === "auth.status") {
      const access = accessState(state);
      return clone({
        userId: "user_demo",
        accountStatus: state.accountStatus,
        accessState: access,
        isAdmin: state.isAdmin,
        agreementRequired: !state.agreementsAccepted,
        inviteRequired: !state.isAdmin && !state.activated,
        currentVersions: {
          userAgreementVersion: AGREEMENT_VERSION,
          privacyPolicyVersion: AGREEMENT_VERSION,
        },
      }) as T;
    }
    if (action === "user.get") {
      return clone({
        accessState: accessState(state),
        user: {
          userId: "user_demo",
          accountStatus: state.accountStatus,
          activationStatus: state.activated || state.isAdmin ? "active" : "pending_invite",
          agreements: state.agreementsAccepted
            ? {
                userAgreement: { version: AGREEMENT_VERSION, acceptedAt: now() },
                privacyPolicy: { version: AGREEMENT_VERSION, acceptedAt: now() },
              }
            : {},
          preferenceText: state.preferenceText,
          preferenceFacts: state.preferenceFacts,
          isAdmin: state.isAdmin,
          remainingQuota: Math.max(0, 5 - state.succeededUsage),
          resourcePauseReason: state.resourcePauseReason,
        },
      }) as T;
    }
    assertActive(state);
    if (action === "resume.list") {
      return clone({ resumes: state.resumes }) as T;
    }
    if (action === "job.get") {
      return clone(getJob(payload)) as T;
    }
    if (action === "application.list") {
      const status = payload.status;
      const applications = state.applications.filter(
        (application) => status === undefined || application.status === status,
      );
      return clone({ applications }) as T;
    }
    if (action === "application.get") {
      const application = getApplication(payload);
      const feedback = state.feedback.find(
        (candidate) => candidate.applicationId === application.applicationId,
      );
      return clone({
        application,
        copyText: `${application.greetingBody.trimEnd()}\n${AI_COPY_LABEL}`,
        ...(feedback === undefined ? {} : { feedback }),
      }) as T;
    }
    if (action === "admin.stats") {
      assertAdmin(state);
      return clone({
        users: { total: 1, enabled: state.accountStatus === "enabled" ? 1 : 0, disabled: state.accountStatus === "disabled" ? 1 : 0, pendingDeletion: 0 },
        invitations: { total: 1, active: 1, consumed: 0, revoked: 0 },
        dailyUsage: { succeeded: state.succeededUsage, reserved: 0, temporaryIncrease: 0 },
        auditEvents: 0,
        resources: [],
      }) as T;
    }
    throw new ApiClientError("INVALID_REQUEST", `演示读取动作未实现：${action}。`, false);
  }

  async function write<T>(action: ClientApiAction, payload: Record<string, unknown>): Promise<T> {
    if (action === "agreement.accept") {
      state.agreementsAccepted = true;
      return clone({ accepted: true, accessState: accessState(state) }) as T;
    }
    if (action === "invite.activate") {
      if (requiredString(payload, "code").toLocaleUpperCase("en-US") !== DEMO_INVITE_CODE) {
        throw new ApiClientError("INVALID_REQUEST", "邀请码无效或已过期。", false);
      }
      state.activated = true;
      return clone({ userId: "user_demo", accessState: "active" }) as T;
    }
    if (action === "user.delete") {
      const operation = requiredString(payload, "operation");
      if (operation === "request") {
        state.deletionToken = "demo-confirmation-token";
        return clone({
          confirmationToken: state.deletionToken,
          expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        }) as T;
      }
      if (
        operation !== "confirm" ||
        payload.confirmationToken !== state.deletionToken
      ) {
        throw new ApiClientError("INVALID_REQUEST", "删除确认已失效。", false);
      }
      state.accountStatus = "disabled";
      return clone({ deletionStatus: "pending", accountStatus: "disabled" }) as T;
    }
    assertActive(state);
    if (action === "user.updatePreferences") {
      const preferenceText = typeof payload.preferenceText === "string" ? payload.preferenceText : "";
      const draft = createPreferenceDraft(preferenceText);
      if (!draft.valid) {
        throw new ApiClientError("LIMIT_EXCEEDED", draft.message, false);
      }
      state.preferenceText = preferenceText.trim();
      state.preferenceFacts = draft.segments.map((text) => ({
        factId: factId(`preference:${text}`),
        sourceType: "preference",
        text,
        factHash: factHash(`preference:${text}`),
      }));
      return clone({
        preferenceText: state.preferenceText,
        preferenceFacts: state.preferenceFacts,
      }) as T;
    }
    if (action === "resume.parse") {
      if (state.resumes.length >= 3) {
        throw new ApiClientError("LIMIT_EXCEEDED", "最多保存 3 份简历。", false);
      }
      const inputType = requiredString(payload, "inputType") as DemoResume["inputType"];
      const resumeId = nextId(state, "resume");
      const jobId = nextId(state, "job");
      const timestamp = now();
      const profile = createProfile(
        resumeId,
        typeof payload.text === "string" ? payload.text : "完成校园 AI 助手项目",
      );
      const resume: DemoResume = {
        resumeId,
        jobId,
        inputType,
        status: "awaiting_confirmation",
        profile,
        isDefault: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      state.resumes.push(resume);
      state.jobs.push({
        jobId,
        kind: "resume_parse",
        status: "awaiting_user_confirmation",
        statusLabel: STATUS_LABELS.awaiting_user_confirmation,
        result: { resumeId, profile: clone(profile), maskingSummary: [] },
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      return clone({ resumeId, jobId }) as T;
    }
    if (action === "resume.confirm") {
      const resume = getResume(payload);
      const candidate = payload.profile;
      if (candidate === null || typeof candidate !== "object") {
        throw new ApiClientError("INVALID_REQUEST", "简历内容无效。", false);
      }
      resume.profile = { ...(clone(candidate) as DemoProfile), confirmed: true };
      resume.status = "confirmed";
      resume.updatedAt = now();
      resume.confirmedAt = resume.updatedAt;
      if (!state.resumes.some(({ isDefault }) => isDefault)) {
        resume.isDefault = true;
      }
      const job = state.jobs.find(({ jobId }) => jobId === resume.jobId);
      if (job !== undefined) {
        job.status = "succeeded";
        job.statusLabel = STATUS_LABELS.succeeded;
        job.updatedAt = resume.updatedAt;
        job.result = { resumeId: resume.resumeId, profile: clone(resume.profile) };
      }
      return clone(resume) as T;
    }
    if (action === "resume.setDefault") {
      const resume = getResume(payload);
      if (resume.status !== "confirmed") {
        throw new ApiClientError("CONFLICT", "只能将已确认简历设为默认。", false);
      }
      state.resumes.forEach((candidate) => {
        candidate.isDefault = candidate.resumeId === resume.resumeId;
      });
      return clone(resume) as T;
    }
    if (action === "resume.delete") {
      const resume = getResume(payload);
      state.resumes = state.resumes.filter(({ resumeId }) => resumeId !== resume.resumeId);
      if (resume.isDefault) {
        const nextDefault = state.resumes.find(({ status }) => status === "confirmed");
        if (nextDefault !== undefined) {
          nextDefault.isDefault = true;
        }
      }
      return clone({ deletedResumeId: resume.resumeId }) as T;
    }
    if (action === "generation.create") {
      if (state.succeededUsage >= 5) {
        throw new ApiClientError("LIMIT_EXCEEDED", "今日次数已用完。", false);
      }
      const resume = getResume(payload);
      if (resume.status !== "confirmed") {
        throw new ApiClientError("CONFLICT", "请先确认简历。", false);
      }
      const text = typeof payload.text === "string" ? payload.text : "";
      const jobId = nextId(state, "job");
      const timestamp = now();
      const needsConfirmation = text.includes("[待确认]");
      const jobDescription = needsConfirmation
        ? {
            responsibilities: [{ fieldId: "jd_responsibility", text: "负责产品需求分析", confidence: 0.7 }],
            hardSkills: [],
            experienceEducation: [],
            locationWorkMode: [],
            availabilityDuration: [],
          }
        : defaultJobDescription();
      const job: DemoJob = {
        jobId,
        kind: "greeting_generate",
        status: needsConfirmation ? "awaiting_user_confirmation" : "generating",
        statusLabel: needsConfirmation
          ? STATUS_LABELS.awaiting_user_confirmation
          : STATUS_LABELS.generating,
        ...(needsConfirmation
          ? { result: { jobDescription, pendingFieldIds: ["jd_job_title", "jd_responsibility"] } }
          : {}),
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      state.jobs.push(job);
      if (!needsConfirmation) {
        createApplication(state, job, resume, jobDescription);
      }
      return clone({ jobId }) as T;
    }
    if (action === "generation.confirmJd") {
      const job = getJob(payload);
      if (job.status !== "awaiting_user_confirmation") {
        throw new ApiClientError("CONFLICT", "任务当前无需确认。", false);
      }
      const resume = state.resumes.find(({ status }) => status === "confirmed");
      if (resume === undefined) {
        throw new ApiClientError("CONFLICT", "已确认简历不存在。", false);
      }
      const jobDescription = clone(payload.jobDescription) as DemoJobDescription;
      if (jobDescription.jobTitle?.text.trim() === "") {
        throw new ApiClientError("INVALID_REQUEST", "岗位名不能为空。", false);
      }
      createApplication(state, job, resume, jobDescription);
      return clone({ jobId: job.jobId, status: job.status }) as T;
    }
    if (action === "application.update") {
      const application = getApplication(payload);
      if (typeof payload.greetingBody === "string") {
        application.greetingBody = payload.greetingBody.trim();
      }
      if (payload.status === "not_applied" || payload.status === "applied") {
        application.status = payload.status;
      }
      if (typeof payload.memo === "string") {
        const memo = payload.memo.trim();
        if (memo === "") {
          delete application.memo;
        } else {
          application.memo = memo;
        }
      }
      application.manualWarnings = application.greetingBody.length < 250
        ? [{ code: "LENGTH_OUT_OF_RANGE", message: "手动正文不在建议的 250-350 字范围内。" }]
        : [];
      application.updatedAt = now();
      return clone({
        application,
        manualEvaluation: {
          canSave: true,
          canCopy: true,
          warnings: application.manualWarnings,
        },
      }) as T;
    }
    if (action === "generation.rewrite") {
      const application = getApplication(payload);
      if (state.succeededUsage >= 5) {
        throw new ApiClientError("LIMIT_EXCEEDED", "今日次数已用完。", false);
      }
      const jobId = nextId(state, "job");
      const timestamp = now();
      application.greetingBody = demoGreeting(application.jdSnapshot.companyName?.text ?? "贵司");
      application.manualWarnings = [];
      application.updatedAt = timestamp;
      state.succeededUsage += 1;
      state.jobs.push({
        jobId,
        kind: "greeting_rewrite",
        status: "succeeded",
        statusLabel: STATUS_LABELS.succeeded,
        result: { applicationId: application.applicationId, application: clone(application) },
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      return clone({ jobId }) as T;
    }
    if (action === "feedback.submit") {
      const application = getApplication(payload);
      const rating = payload.rating;
      if (rating !== "satisfied" && rating !== "needs_improvement") {
        throw new ApiClientError("INVALID_REQUEST", "请选择反馈类型。", false);
      }
      const existing = state.feedback.find(
        (candidate) => candidate.applicationId === application.applicationId,
      );
      const timestamp = now();
      const note = typeof payload.note === "string" && payload.note.trim() !== ""
        ? payload.note.trim()
        : undefined;
      if (existing === undefined) {
        state.feedback.push({
          applicationId: application.applicationId,
          rating,
          ...(note === undefined ? {} : { note }),
          createdAt: timestamp,
          updatedAt: timestamp,
        });
      } else {
        existing.rating = rating;
        existing.updatedAt = timestamp;
        if (note === undefined) {
          delete existing.note;
        } else {
          existing.note = note;
        }
      }
      return clone({
        feedback: state.feedback.find(
          (candidate) => candidate.applicationId === application.applicationId,
        ),
      }) as T;
    }
    if (action === "application.delete") {
      const application = getApplication(payload);
      state.applications = state.applications.filter(
        ({ applicationId }) => applicationId !== application.applicationId,
      );
      state.feedback = state.feedback.filter(
        ({ applicationId }) => applicationId !== application.applicationId,
      );
      return clone({ deletedApplicationId: application.applicationId }) as T;
    }
    if (action === "admin.inviteCreate") {
      assertAdmin(state);
      return clone({ inviteId: "invite_demo", code: DEMO_INVITE_CODE, expiresAt: now() }) as T;
    }
    if (action === "admin.inviteRevoke") {
      assertAdmin(state);
      return clone({ inviteId: requiredString(payload, "inviteId"), status: "revoked" }) as T;
    }
    if (action === "admin.userSetEnabled" || action === "admin.quotaAdjust") {
      assertAdmin(state);
      return clone({ accepted: true }) as T;
    }
    throw new ApiClientError("INVALID_REQUEST", `演示写入动作未实现：${action}。`, false);
  }

  return { read, write };
}

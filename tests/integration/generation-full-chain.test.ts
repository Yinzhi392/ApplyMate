import { describe, expect, it } from "vitest";

import {
  AgreementService,
  GenerationExecutionService,
  GenerationPreparationService,
  GenerationWorkflowService,
  IdempotencyService,
  InMemoryApplicationRepository,
  InMemoryGenerationRepository,
  InMemoryIdempotencyRepository,
  InMemoryIdentityRepository,
  InMemoryJobRepository,
  InMemoryQuotaRepository,
  InMemoryResumeRepository,
  InMemoryTemporaryFileRepository,
  JdInputValidationService,
  JobService,
  QuotaService,
  ResumeAccessService,
  ResumeFileValidationService,
  ResumeManagementService,
  TemporaryFileService,
  UserService,
  createIdentityAccessApi,
  type ResumeRecord,
} from "../../cloudfunctions/api/src/index.js";
import {
  GreetingGenerationPipeline,
  GreetingModelGateway,
  JdParsePipeline,
  JdStructureParser,
} from "../../cloudfunctions/worker/src/index.js";
import {
  countVisibleCharacters,
  createFactId,
  hashFactText,
  type GreetingDraft,
  type ResumeProfile,
} from "../../shared/src/index.js";

const NOW = new Date("2026-08-05T18:00:00.000Z");
const OPEN_ID = "wx_full_chain_admin";
const VERSIONS = {
  userAgreementVersion: "user-2026-08",
  privacyPolicyVersion: "privacy-2026-08",
};
const FACT_TEXT = "使用 SQL 完成3次课程分析";
const FACT_ID = createFactId("skill", FACT_TEXT);

function profile(): ResumeProfile {
  return {
    resumeId: "resume_full_chain",
    education: [],
    experiences: [],
    projects: [],
    skills: [{
      factId: FACT_ID,
      sourceType: "skill",
      text: FACT_TEXT,
      factHash: hashFactText(FACT_TEXT),
      name: "SQL",
    }],
    languages: [],
    certificates: [],
    achievements: [],
    preferences: [],
    otherFacts: [],
    confirmed: true,
  };
}

function greeting(): GreetingDraft {
  const claim = "我使用 SQL 完成3次课程分析";
  const first = `您好，看到贵司正在招聘产品实习生。${claim}，能够围绕岗位任务认真整理数据、拆解问题并形成清晰结论。`;
  let second = "我重视事实准确和沟通效率，愿意从基础工作做起，主动同步进展、认真吸收团队反馈，并把每次复盘转化为更稳定的交付。期待有机会进一步交流，也愿意承担细致的资料整理、需求跟进与协作工作。";
  while (countVisibleCharacters(`${first}\n${second}`) < 250) {
    second += "我会保持可靠响应，并认真完成每项工作。";
  }
  return {
    body: `${first}\n${second}`,
    claims: [{
      claimId: "claim_full_chain",
      text: claim,
      sources: [
        { type: "fact", factId: FACT_ID },
        { type: "jd", fieldId: "jd_skill_sql" },
      ],
    }],
    omittedRequirements: [],
    warnings: [],
  };
}

describe("full generation chain", () => {
  it("recovers the succeeded job after the page API instance is recreated", async () => {
    const identities = new InMemoryIdentityRepository();
    const user = await new UserService(identities).getOrCreateUser(OPEN_ID, NOW);
    await new AgreementService(identities, VERSIONS).acceptAgreements(
      user,
      VERSIONS,
      NOW,
    );
    const jobs = new JobService(new InMemoryJobRepository(), () => "job_full_chain");
    const resumes = new InMemoryResumeRepository();
    const resumeRecord: ResumeRecord = {
      resumeId: "resume_full_chain",
      userId: user.userId,
      jobId: "job_resume_full_chain",
      inputType: "text",
      temporaryFileIds: [],
      status: "confirmed",
      profile: profile(),
      isDefault: true,
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
      confirmedAt: NOW.toISOString(),
    };
    await resumes.createDraftIfBelowLimit(resumeRecord, 3);
    const temporaryFiles = new TemporaryFileService(
      new InMemoryTemporaryFileRepository(),
    );
    const generations = new InMemoryGenerationRepository();
    const dispatched: string[] = [];
    const workflow = new GenerationWorkflowService({
      generations,
      resumeAccess: new ResumeAccessService(resumes),
      inputValidation: new JdInputValidationService(
        temporaryFiles,
        new ResumeFileValidationService(),
      ),
      jobs,
      dispatcher: { dispatch: (jobId) => dispatched.push(jobId) },
      temporaryFiles,
    });
    const createApi = () =>
      createIdentityAccessApi({
        repository: identities,
        idempotency: new IdempotencyService(new InMemoryIdempotencyRepository()),
        jobs,
        generation: workflow,
        currentVersions: VERSIONS,
        adminOpenIds: [OPEN_ID],
        now: () => NOW,
        readCloudBaseContext: () => ({ OPENID: OPEN_ID }),
      });
    const created = await createApi()({
      action: "generation.create",
      payload: {
        resumeId: "resume_full_chain",
        inputType: "text",
        text: "产品实习生，要求 SQL，负责数据整理。",
      },
      requestId: "60000011-1234-4234-a234-123456789abc",
    });
    expect(created).toMatchObject({ ok: true, data: { jobId: "job_full_chain" } });
    expect(dispatched).toEqual(["job_full_chain"]);

    const jdPipeline = new JdParsePipeline({
      ocr: { recognize: async () => { throw new Error("text path must not OCR"); } },
      parser: new JdStructureParser({
        parseJobDescription: async () => ({
          jobTitle: { fieldId: "jd_job_title", text: "产品实习生", confidence: 1 },
          responsibilities: [],
          hardSkills: [{ fieldId: "jd_skill_sql", text: "SQL", confidence: 1 }],
          experienceEducation: [],
          locationWorkMode: [],
          availabilityDuration: [],
        }),
      }),
    });
    const applications = new InMemoryApplicationRepository();
    const execution = new GenerationExecutionService({
      preparation: new GenerationPreparationService(
        jobs,
        generations,
        temporaryFiles,
        jdPipeline,
        () => NOW,
      ),
      jobs,
      generations,
      quotas: new QuotaService(new InMemoryQuotaRepository()),
      applications,
      generator: new GreetingGenerationPipeline(
        new GreetingModelGateway({
          modelId: "synthetic-model",
          disclosure: {
            mode: "demo",
            providerName: "ApplyMate 本地演示适配器",
            modelName: "本地合成响应",
            filingReference: "本地演示不适用",
          },
          generate: async () => greeting(),
        }),
      ),
      now: () => NOW,
    });
    await expect(
      execution.run("job_full_chain", "worker_full_chain", NOW),
    ).resolves.toBe(true);

    await new ResumeManagementService(resumes, temporaryFiles).delete(
      user.userId,
      "resume_full_chain",
      NOW,
    );
    await expect(resumes.getById("resume_full_chain")).resolves.toBeNull();
    await expect(applications.getByJobId("job_full_chain")).resolves.toMatchObject({
      factSnapshot: [{ factId: FACT_ID, text: FACT_TEXT }],
      jdSnapshot: { jobTitle: { text: "产品实习生" } },
    });

    const restoredApi = createApi();
    await expect(
      restoredApi({ action: "job.get", payload: { jobId: "job_full_chain" } }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        status: "succeeded",
        result: {
          applicationId: "application_job_full_chain",
          greeting: { body: expect.stringContaining("产品实习生") },
        },
      },
    });
    await expect(applications.getByJobId("job_full_chain")).resolves.toMatchObject({
      applicationId: "application_job_full_chain",
      status: "not_applied",
      generationDisclosure: {
        mode: "demo",
        providerName: "ApplyMate 本地演示适配器",
        modelName: "本地合成响应",
        modelId: "synthetic-model",
        promptVersion: "greeting-v1",
      },
    });
  });
});

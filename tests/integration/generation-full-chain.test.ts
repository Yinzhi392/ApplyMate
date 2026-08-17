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
const FACTS = [
  "在课程项目中使用 SQL 完成3次数据分析，清洗课程数据、复核统计口径，并将分析结果整理成结构化结论",
  "为课程分析编写结构化报告，记录数据口径、关键发现和结果复核过程，并使用图表向项目成员说明分析结论",
  "根据课程项目反馈调整两项分析口径，重新运行 SQL 查询并复核输出，将修改原因和前后差异同步给项目成员",
  "在另一项课程任务中整理用户需求与数据字段，拆分资料收集、数据核对和结果说明三个步骤，并按节点记录进展",
  "对两份课程数据表执行字段映射和缺失值核对，记录异常项并在交付前逐项复查",
  "在课程汇报中，我向4名项目成员说明数据口径、分析步骤和复核结果，并记录五项提问和三项后续修改事项",
] as const;
const FACT_IDS = FACTS.map((text) => createFactId("project", text));

function profile(): ResumeProfile {
  return {
    resumeId: "resume_full_chain",
    education: [],
    experiences: [],
    projects: FACTS.map((text, index) => ({
      factId: FACT_IDS[index]!,
      sourceType: "project" as const,
      text,
      factHash: hashFactText(text),
      name: `课程项目事实 ${index + 1}`,
    })),
    skills: [],
    languages: [],
    certificates: [],
    achievements: [],
    preferences: [],
    otherFacts: [],
    confirmed: true,
  };
}

function greeting(): GreetingDraft {
  const paragraphs = [
    "您好，我想应聘示例科技的产品实习生。在课程项目中，我使用 SQL 完成3次数据分析，清洗课程数据、复核统计口径，并将分析结果整理成结构化结论；这段记录能够直接说明我实际处理过数据整理和结果核对任务。",
    "我也为课程分析编写过结构化报告，完整记录数据口径、关键发现和结果复核过程，并使用图表向项目成员说明分析结论。收到课程项目反馈后，我调整两项分析口径，重新运行 SQL 查询并复核输出，同时同步修改原因和前后差异。",
    "在另一项课程任务中，我整理用户需求与数据字段，拆分资料收集、数据核对和结果说明三个步骤，并按节点记录进展。我还对两份课程数据表执行字段映射和缺失值核对，记录异常项并在交付前逐项复查。在课程汇报中，我向4名项目成员说明数据口径、分析步骤和复核结果，并记录五项提问和三项后续修改事项。岗位涉及数据整理、需求跟进与团队协作。期待有机会进一步沟通，谢谢。",
  ];
  const sources = [
    [
      { type: "fact" as const, factId: FACT_IDS[0]! },
      { type: "jd" as const, fieldId: "jd_job_title" },
      { type: "jd" as const, fieldId: "jd_responsibility" },
    ],
    [
      { type: "fact" as const, factId: FACT_IDS[1]! },
      { type: "fact" as const, factId: FACT_IDS[2]! },
      { type: "jd" as const, fieldId: "jd_responsibility" },
    ],
    [
      { type: "fact" as const, factId: FACT_IDS[3]! },
      { type: "fact" as const, factId: FACT_IDS[4]! },
      { type: "fact" as const, factId: FACT_IDS[5]! },
      { type: "jd" as const, fieldId: "jd_responsibility" },
    ],
  ];
  const body = paragraphs.join("\n");
  expect(countVisibleCharacters(body)).toBeGreaterThanOrEqual(350);
  expect(countVisibleCharacters(body)).toBeLessThanOrEqual(450);
  return {
    body,
    claims: paragraphs.map((text, index) => ({
      claimId: `claim_full_chain_${index + 1}`,
      text,
      sources: sources[index]!,
    })),
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
        text: "示例科技招聘产品实习生，要求 SQL，负责数据整理、需求跟进与团队协作。",
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
          companyName: { fieldId: "jd_company", text: "示例科技", confidence: 1 },
          responsibilities: [{
            fieldId: "jd_responsibility",
            text: "负责数据整理、需求跟进与团队协作",
            confidence: 1,
          }],
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
      factSnapshot: FACTS.map((text, index) => ({ factId: FACT_IDS[index], text })),
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
        promptVersion: "greeting-evidence-planned-v8",
      },
    });
  });
});

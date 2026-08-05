import { describe, expect, it } from "vitest";

import {
  GenerationExecutionService,
  GenerationPreparationService,
  InMemoryApplicationRepository,
  InMemoryGenerationRepository,
  InMemoryJobRepository,
  InMemoryQuotaRepository,
  InMemoryTemporaryFileRepository,
  JobService,
  QuotaService,
  StaleJobCleanupService,
  TemporaryFileService,
  type GenerationRecord,
} from "../../cloudfunctions/api/src/index.js";
import {
  countVisibleCharacters,
  createFactId,
  hashFactText,
  type GreetingDraft,
  type ResumeProfile,
} from "../../shared/src/index.js";

const CREATED = new Date("2026-08-05T12:00:00.000Z");
const CLEANUP_AT = new Date("2026-08-05T12:10:00.000Z");
const FACT_TEXT = "使用 SQL 完成3次分析";
const FACT_ID = createFactId("skill", FACT_TEXT);

function profile(): ResumeProfile {
  return {
    resumeId: "resume_race_01",
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

function draft(): GreetingDraft {
  const claim = "我使用 SQL 完成3次分析";
  const first = `您好，看到贵司正在招聘产品实习生。${claim}，能够认真梳理信息并形成清晰结论。`;
  let second = "我愿意从基础任务做起，主动同步进展、认真吸收反馈，并把每次复盘转化为更稳定的交付。期待进一步交流，也愿意承担细致的资料整理、需求跟进和协作工作。";
  while (countVisibleCharacters(`${first}\n${second}`) < 250) {
    second += "我会保持可靠响应，认真完成每项工作。";
  }
  return {
    body: `${first}\n${second}`,
    claims: [{
      claimId: "claim_race",
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

describe("generation quota settlement race", () => {
  it("keeps counters non-negative when duplicate workers and cleanup race", async () => {
    const jobs = new JobService(new InMemoryJobRepository(), () => "job_race_01");
    const job = await jobs.createJob("user_race", "greeting_generate", CREATED);
    const generations = new InMemoryGenerationRepository();
    const record: GenerationRecord = {
      jobId: job.jobId,
      userId: "user_race",
      resumeId: "resume_race_01",
      inputType: "text",
      temporaryFileIds: [],
      sourceText: "产品实习生，要求 SQL",
      resumeSnapshot: profile(),
      preferenceSnapshot: [],
      status: "processing",
      createdAt: CREATED.toISOString(),
      updatedAt: CREATED.toISOString(),
    };
    await generations.create(record);
    const preparation = new GenerationPreparationService(
      jobs,
      generations,
      new TemporaryFileService(new InMemoryTemporaryFileRepository()),
      {
        extract: async (source) => source.sourceText ?? "",
        parse: async (text) => ({
          maskedText: text,
          jobDescription: {
            jobTitle: { fieldId: "jd_job_title", text: "产品实习生", confidence: 1 },
            responsibilities: [],
            hardSkills: [{ fieldId: "jd_skill_sql", text: "SQL", confidence: 1 }],
            experienceEducation: [],
            locationWorkMode: [],
            availabilityDuration: [],
          },
          maskedTypes: [],
          maskedCount: 0,
        }),
      },
      () => CREATED,
    );
    const quotas = new QuotaService(new InMemoryQuotaRepository());
    let releaseGenerator!: () => void;
    const generatorBlocked = new Promise<void>((resolve) => {
      releaseGenerator = resolve;
    });
    let generatorStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      generatorStarted = resolve;
    });
    const execution = new GenerationExecutionService({
      preparation,
      jobs,
      generations,
      quotas,
      applications: new InMemoryApplicationRepository(),
      generator: {
        generate: async () => {
          generatorStarted();
          await generatorBlocked;
          return draft();
        },
      },
      now: () => CREATED,
    });
    const firstWorker = execution.run(job.jobId, "worker_race_1", CREATED);
    await started;
    await expect(
      execution.run(job.jobId, "worker_race_2", CREATED),
    ).resolves.toBe(false);

    const cleanup = new StaleJobCleanupService(jobs, quotas);
    await expect(cleanup.run(CLEANUP_AT)).resolves.toEqual({ candidates: 1, failed: 1 });
    releaseGenerator();
    await expect(firstWorker).resolves.toBe(true);
    await expect(quotas.getUsage("user_race", CLEANUP_AT)).resolves.toMatchObject({
      reserved: 0,
      succeeded: 0,
    });
    await expect(jobs.getJobForUser("user_race", job.jobId)).resolves.toMatchObject({
      status: "failed",
      error: { code: "JOB_STALE_TIMEOUT" },
    });
  });
});

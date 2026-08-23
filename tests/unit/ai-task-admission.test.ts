import { describe, expect, it } from "vitest";

import type { ServiceAccess } from "../../shared/src/service-access";
import {
  AiTaskAdmissionService,
  InMemoryAiTaskAdmissionRepository,
} from "../../cloudfunctions/api/src/ai-task-admission-service";

const available: ServiceAccess = {
  phase: "active",
  aiAvailability: "available",
  aiClosesAt: "2026-11-01T00:00:00+08:00",
  dataAccessEndsAt: "2027-03-01T00:00:00+08:00",
};
const now = new Date("2026-09-10T10:00:00+08:00");

describe("AI task admission", () => {
  it("reserves once, blocks a concurrent user task, and settles idempotently", async () => {
    const repository = new InMemoryAiTaskAdmissionRepository();
    await repository.configurePeriod("2026-09", 1_990, now);
    const service = new AiTaskAdmissionService(repository, () => "admission_one");
    const first = await service.reserve({
      estimatedCostFen: 5,
      jobId: "job_one",
      now,
      serviceAccess: available,
      userId: "user_one",
    });
    await expect(service.reserve({
      admissionId: "admission_two",
      estimatedCostFen: 5,
      jobId: "job_two",
      now,
      serviceAccess: available,
      userId: "user_one",
    })).rejects.toMatchObject({ code: "ACTIVE_JOB_EXISTS" });
    await service.succeed(first.admissionId, 4, now);
    await service.succeed(first.admissionId, 4, now);
    await expect(repository.getBudgetStatus("2026-09", now)).resolves.toMatchObject({
      fixedCostFen: 1_990,
      reservedFen: 0,
      conservativeSettledFen: 4,
    });
  });

  it("enforces three creates per ten minutes after completed tasks", async () => {
    const repository = new InMemoryAiTaskAdmissionRepository();
    await repository.configurePeriod("2026-09", 0, now);
    const service = new AiTaskAdmissionService(repository);
    for (let index = 0; index < 3; index += 1) {
      const admission = await service.reserve({
        admissionId: `admission_${index}`,
        estimatedCostFen: 1,
        jobId: `job_${index}`,
        now,
        serviceAccess: available,
        userId: "user_rate",
      });
      await service.release(admission.admissionId, now);
    }
    await expect(service.reserve({
      admissionId: "admission_four",
      estimatedCostFen: 1,
      jobId: "job_four",
      now,
      serviceAccess: available,
      userId: "user_rate",
    })).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("stops before projected exposure reaches ninety yuan", async () => {
    const repository = new InMemoryAiTaskAdmissionRepository();
    await repository.configurePeriod("2026-09", 8_900, now);
    const service = new AiTaskAdmissionService(repository);
    await expect(service.reserve({
      admissionId: "admission_budget",
      estimatedCostFen: 100,
      jobId: "job_budget",
      now,
      serviceAccess: available,
      userId: "user_budget",
    })).rejects.toMatchObject({ code: "MONTHLY_BUDGET_EXHAUSTED" });
  });

  it("rejects new tasks during the read-only period without a reservation", async () => {
    const repository = new InMemoryAiTaskAdmissionRepository();
    await repository.configurePeriod("2026-09", 0, now);
    const service = new AiTaskAdmissionService(repository);
    await expect(service.reserve({
      admissionId: "admission_closed",
      estimatedCostFen: 1,
      jobId: "job_closed",
      now,
      serviceAccess: { ...available, phase: "read_only", aiAvailability: "scheduled_closed" },
      userId: "user_closed",
    })).rejects.toMatchObject({ code: "SERVICE_READ_ONLY" });
  });
});

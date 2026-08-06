import {
  MAX_FEEDBACK_VISIBLE_CHARACTERS,
  MAX_TEXT_VISIBLE_CHARACTERS,
  composeGreetingCopy,
  countVisibleCharacters,
  evaluateManualGreeting,
  hasValidUnicode,
  type EvidenceSourceRegistry,
  type GreetingDraft,
  type ManualGreetingEvaluation,
} from "../../../shared/src/index.js";

import type { ApplicationRecord } from "./application-domain.js";
import type { ApplicationRepository } from "./application-repository.js";
import { DomainError } from "./domain-error.js";

export interface ApplicationListFilter {
  status?: ApplicationRecord["status"] | undefined;
}

export interface ApplicationUpdate {
  greetingBody?: string | undefined;
  status?: ApplicationRecord["status"] | undefined;
  memo?: string | undefined;
}

export interface ApplicationDetail {
  application: ApplicationRecord;
  copyText: string;
}

export interface ApplicationDependentDataRepository {
  deleteByApplicationId(applicationId: string): Promise<void>;
}

function jdFieldIds(record: ApplicationRecord): Set<string> {
  const jd = record.jdSnapshot;
  return new Set(
    [
      jd.jobTitle,
      jd.companyName,
      ...jd.responsibilities,
      ...jd.hardSkills,
      ...jd.experienceEducation,
      ...jd.locationWorkMode,
      ...jd.availabilityDuration,
    ]
      .filter((field) => field !== undefined)
      .map(({ fieldId }) => fieldId),
  );
}

function sourceRegistry(record: ApplicationRecord): EvidenceSourceRegistry {
  return {
    factIds: new Set(record.factSnapshot.map(({ factId }) => factId)),
    jdFieldIds: jdFieldIds(record),
  };
}

function manualDraft(record: ApplicationRecord): GreetingDraft {
  return {
    body: record.greetingBody,
    claims: record.evidence,
    omittedRequirements: record.omittedRequirements,
    warnings: record.warnings,
  };
}

function validateManualBody(body: string): void {
  if (
    body.trim() === "" ||
    !hasValidUnicode(body) ||
    countVisibleCharacters(body) > MAX_TEXT_VISIBLE_CHARACTERS
  ) {
    throw new DomainError("INVALID_REQUEST", "Greeting text is invalid.");
  }
}

function normalizeMemo(memo: string | undefined): string | undefined {
  if (memo === undefined) {
    return undefined;
  }
  const normalized = memo.trim();
  if (
    !hasValidUnicode(memo) ||
    countVisibleCharacters(normalized) > MAX_FEEDBACK_VISIBLE_CHARACTERS
  ) {
    throw new DomainError("INVALID_REQUEST", "Application memo is invalid.");
  }
  return normalized === "" ? undefined : normalized;
}

export class ApplicationService {
  constructor(
    private readonly repository: ApplicationRepository,
    private readonly dependentData?: ApplicationDependentDataRepository,
  ) {}

  async list(
    userId: string,
    filter: ApplicationListFilter = {},
  ): Promise<ApplicationRecord[]> {
    const records = await this.repository.listByUser(userId);
    return records
      .filter(({ status }) => filter.status === undefined || status === filter.status)
      .sort(
        (left, right) =>
          right.updatedAt.localeCompare(left.updatedAt) ||
          left.applicationId.localeCompare(right.applicationId),
      );
  }

  async get(userId: string, applicationId: string): Promise<ApplicationDetail> {
    const application = await this.getOwned(userId, applicationId);
    return {
      application,
      copyText: composeGreetingCopy(application.greetingBody),
    };
  }

  async update(
    userId: string,
    applicationId: string,
    update: ApplicationUpdate,
    now: Date,
  ): Promise<{
    application: ApplicationRecord;
    manualEvaluation: ManualGreetingEvaluation;
  }> {
    const current = await this.getOwned(userId, applicationId);
    const nextBody = update.greetingBody ?? current.greetingBody;
    validateManualBody(nextBody);
    const memo =
      update.memo === undefined ? current.memo : normalizeMemo(update.memo);
    const candidate: ApplicationRecord = {
      ...current,
      greetingBody: nextBody,
      status: update.status ?? current.status,
      updatedAt: now.toISOString(),
    };
    if (memo === undefined) {
      delete candidate.memo;
    } else {
      candidate.memo = memo;
    }
    const manualEvaluation = evaluateManualGreeting(
      manualDraft(candidate),
      sourceRegistry(candidate),
    );
    candidate.manualWarnings = [...manualEvaluation.warnings];
    await this.repository.save(candidate);
    return { application: candidate, manualEvaluation };
  }

  async delete(userId: string, applicationId: string): Promise<void> {
    await this.getOwned(userId, applicationId);
    await this.dependentData?.deleteByApplicationId(applicationId);
    if (!(await this.repository.deleteForUser(applicationId, userId))) {
      throw new DomainError("NOT_FOUND", "Application was not found.");
    }
  }

  private async getOwned(
    userId: string,
    applicationId: string,
  ): Promise<ApplicationRecord> {
    const record = await this.repository.getById(applicationId);
    if (record === null || record.userId !== userId) {
      throw new DomainError("NOT_FOUND", "Application was not found.");
    }
    return record;
  }
}

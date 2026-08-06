import {
  MAX_FEEDBACK_VISIBLE_CHARACTERS,
  countVisibleCharacters,
  hasValidUnicode,
} from "../../../shared/src/index.js";

import type { ApplicationService } from "./application-service.js";
import { DomainError } from "./domain-error.js";
import type { FeedbackRating, FeedbackRecord } from "./feedback-domain.js";
import type { FeedbackRepository } from "./feedback-repository.js";

export interface FeedbackSubmission {
  applicationId: string;
  rating: FeedbackRating;
  note?: string | undefined;
}

function normalizeNote(note: string | undefined): string | undefined {
  if (note === undefined) {
    return undefined;
  }
  const normalized = note.trim();
  if (
    !hasValidUnicode(note) ||
    countVisibleCharacters(normalized) > MAX_FEEDBACK_VISIBLE_CHARACTERS
  ) {
    throw new DomainError("INVALID_REQUEST", "Feedback note is invalid.");
  }
  return normalized === "" ? undefined : normalized;
}

export class FeedbackService {
  constructor(
    private readonly applications: ApplicationService,
    private readonly repository: FeedbackRepository,
  ) {}

  async submit(
    userId: string,
    input: FeedbackSubmission,
    now: Date,
  ): Promise<FeedbackRecord> {
    await this.applications.get(userId, input.applicationId);
    const current = await this.repository.getByApplicationId(input.applicationId);
    if (current !== null && current.userId !== userId) {
      throw new DomainError("NOT_FOUND", "Application was not found.");
    }
    const timestamp = now.toISOString();
    const note = normalizeNote(input.note);
    const record: FeedbackRecord = {
      feedbackId: current?.feedbackId ?? `feedback_${input.applicationId}`,
      applicationId: input.applicationId,
      userId,
      rating: input.rating,
      createdAt: current?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };
    if (note !== undefined) {
      record.note = note;
    }
    await this.repository.upsert(record);
    return record;
  }

  async getForApplication(
    userId: string,
    applicationId: string,
  ): Promise<FeedbackRecord | null> {
    await this.applications.get(userId, applicationId);
    const feedback = await this.repository.getByApplicationId(applicationId);
    return feedback === null || feedback.userId !== userId ? null : feedback;
  }
}

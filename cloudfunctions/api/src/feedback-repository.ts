import type { FeedbackRecord } from "./feedback-domain.js";

export interface FeedbackRepository {
  getByApplicationId(applicationId: string): Promise<FeedbackRecord | null>;
  listByUser(userId: string): Promise<FeedbackRecord[]>;
  upsert(record: FeedbackRecord): Promise<void>;
  deleteByApplicationId(applicationId: string): Promise<void>;
}

function cloneFeedback(record: FeedbackRecord): FeedbackRecord {
  return structuredClone(record);
}

export class InMemoryFeedbackRepository implements FeedbackRepository {
  readonly #records = new Map<string, FeedbackRecord>();

  async getByApplicationId(
    applicationId: string,
  ): Promise<FeedbackRecord | null> {
    const record = this.#records.get(applicationId);
    return record === undefined ? null : cloneFeedback(record);
  }

  async listByUser(userId: string): Promise<FeedbackRecord[]> {
    return Array.from(this.#records.values())
      .filter((record) => record.userId === userId)
      .map(cloneFeedback);
  }

  async upsert(record: FeedbackRecord): Promise<void> {
    const current = this.#records.get(record.applicationId);
    if (current !== undefined && current.userId !== record.userId) {
      throw new Error("Feedback owner cannot change.");
    }
    this.#records.set(record.applicationId, cloneFeedback(record));
  }

  async deleteByApplicationId(applicationId: string): Promise<void> {
    this.#records.delete(applicationId);
  }
}

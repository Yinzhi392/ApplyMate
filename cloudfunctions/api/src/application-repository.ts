import type { ApplicationRecord } from "./application-domain.js";

export interface ApplicationRepository {
  create(record: ApplicationRecord): Promise<void>;
  getById(applicationId: string): Promise<ApplicationRecord | null>;
  getByJobId(jobId: string): Promise<ApplicationRecord | null>;
  listByUser(userId: string): Promise<ApplicationRecord[]>;
  save(record: ApplicationRecord): Promise<void>;
  saveIfUpdatedAt(
    record: ApplicationRecord,
    expectedUpdatedAt: string,
  ): Promise<ApplicationRecord | null>;
  deleteForUser(applicationId: string, userId: string): Promise<boolean>;
  deleteByJobId(jobId: string): Promise<boolean>;
}

function cloneApplication(record: ApplicationRecord): ApplicationRecord {
  return structuredClone(record);
}

export class InMemoryApplicationRepository implements ApplicationRepository {
  readonly #records = new Map<string, ApplicationRecord>();
  readonly #jobIndex = new Map<string, string>();

  async create(record: ApplicationRecord): Promise<void> {
    if (this.#records.has(record.applicationId) || this.#jobIndex.has(record.jobId)) {
      throw new Error("Application identifier must be unique.");
    }
    this.#records.set(record.applicationId, cloneApplication(record));
    this.#jobIndex.set(record.jobId, record.applicationId);
  }

  async getByJobId(jobId: string): Promise<ApplicationRecord | null> {
    const applicationId = this.#jobIndex.get(jobId);
    const record =
      applicationId === undefined ? undefined : this.#records.get(applicationId);
    return record === undefined ? null : cloneApplication(record);
  }

  async getById(applicationId: string): Promise<ApplicationRecord | null> {
    const record = this.#records.get(applicationId);
    return record === undefined ? null : cloneApplication(record);
  }

  async listByUser(userId: string): Promise<ApplicationRecord[]> {
    return Array.from(this.#records.values())
      .filter((record) => record.userId === userId)
      .map(cloneApplication);
  }

  async save(record: ApplicationRecord): Promise<void> {
    const current = this.#records.get(record.applicationId);
    if (
      current === undefined ||
      current.userId !== record.userId ||
      current.jobId !== record.jobId
    ) {
      throw new Error("Cannot save an unknown application record.");
    }
    this.#records.set(record.applicationId, cloneApplication(record));
  }

  async saveIfUpdatedAt(
    record: ApplicationRecord,
    expectedUpdatedAt: string,
  ): Promise<ApplicationRecord | null> {
    const current = this.#records.get(record.applicationId);
    if (
      current === undefined ||
      current.userId !== record.userId ||
      current.jobId !== record.jobId ||
      current.updatedAt !== expectedUpdatedAt
    ) {
      return null;
    }
    this.#records.set(record.applicationId, cloneApplication(record));
    return cloneApplication(record);
  }

  async deleteForUser(applicationId: string, userId: string): Promise<boolean> {
    const record = this.#records.get(applicationId);
    if (record === undefined || record.userId !== userId) {
      return false;
    }
    this.#jobIndex.delete(record.jobId);
    return this.#records.delete(applicationId);
  }

  async deleteByJobId(jobId: string): Promise<boolean> {
    const applicationId = this.#jobIndex.get(jobId);
    if (applicationId === undefined) {
      return false;
    }
    this.#jobIndex.delete(jobId);
    return this.#records.delete(applicationId);
  }
}

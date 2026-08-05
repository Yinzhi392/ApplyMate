import type { ApplicationRecord } from "./application-domain.js";

export interface ApplicationRepository {
  create(record: ApplicationRecord): Promise<void>;
  getByJobId(jobId: string): Promise<ApplicationRecord | null>;
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

  async deleteByJobId(jobId: string): Promise<boolean> {
    const applicationId = this.#jobIndex.get(jobId);
    if (applicationId === undefined) {
      return false;
    }
    this.#jobIndex.delete(jobId);
    return this.#records.delete(applicationId);
  }
}

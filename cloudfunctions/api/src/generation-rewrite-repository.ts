import type { RewriteRecord } from "./generation-rewrite-domain.js";

export interface RewriteRepository {
  create(record: RewriteRecord): Promise<void>;
  getByJobId(jobId: string): Promise<RewriteRecord | null>;
  save(record: RewriteRecord): Promise<void>;
  deleteByUserId(userId: string): Promise<number>;
}

function cloneRewrite(record: RewriteRecord): RewriteRecord {
  return structuredClone(record);
}

export class InMemoryRewriteRepository implements RewriteRepository {
  readonly #records = new Map<string, RewriteRecord>();

  async create(record: RewriteRecord): Promise<void> {
    if (this.#records.has(record.jobId)) {
      throw new Error("Rewrite job identifier must be unique.");
    }
    this.#records.set(record.jobId, cloneRewrite(record));
  }

  async getByJobId(jobId: string): Promise<RewriteRecord | null> {
    const record = this.#records.get(jobId);
    return record === undefined ? null : cloneRewrite(record);
  }

  async save(record: RewriteRecord): Promise<void> {
    if (!this.#records.has(record.jobId)) {
      throw new Error("Cannot save an unknown rewrite record.");
    }
    this.#records.set(record.jobId, cloneRewrite(record));
  }

  async deleteByUserId(userId: string): Promise<number> {
    let deleted = 0;
    for (const [jobId, record] of this.#records) {
      if (record.userId === userId && this.#records.delete(jobId)) {
        deleted += 1;
      }
    }
    return deleted;
  }
}

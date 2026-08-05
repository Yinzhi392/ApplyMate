import type { GenerationRecord } from "./generation-domain.js";

export interface GenerationRepository {
  create(record: GenerationRecord): Promise<void>;
  getByJobId(jobId: string): Promise<GenerationRecord | null>;
  save(record: GenerationRecord): Promise<void>;
  saveIfStatus(
    record: GenerationRecord,
    expectedStatus: GenerationRecord["status"],
  ): Promise<GenerationRecord | null>;
  listFileCleanupCandidates(): Promise<GenerationRecord[]>;
}

function cloneGeneration(record: GenerationRecord): GenerationRecord {
  return structuredClone(record);
}

export class InMemoryGenerationRepository implements GenerationRepository {
  readonly #records = new Map<string, GenerationRecord>();

  async create(record: GenerationRecord): Promise<void> {
    if (this.#records.has(record.jobId)) {
      throw new Error("Generation job identifier must be unique.");
    }
    this.#records.set(record.jobId, cloneGeneration(record));
  }

  async getByJobId(jobId: string): Promise<GenerationRecord | null> {
    const record = this.#records.get(jobId);
    return record === undefined ? null : cloneGeneration(record);
  }

  async save(record: GenerationRecord): Promise<void> {
    if (!this.#records.has(record.jobId)) {
      throw new Error("Cannot save an unknown generation record.");
    }
    this.#records.set(record.jobId, cloneGeneration(record));
  }

  async saveIfStatus(
    record: GenerationRecord,
    expectedStatus: GenerationRecord["status"],
  ): Promise<GenerationRecord | null> {
    const current = this.#records.get(record.jobId);
    if (current === undefined || current.status !== expectedStatus) {
      return null;
    }
    this.#records.set(record.jobId, cloneGeneration(record));
    return cloneGeneration(record);
  }

  async listFileCleanupCandidates(): Promise<GenerationRecord[]> {
    return Array.from(this.#records.values())
      .filter(
        ({ status, temporaryFileIds }) =>
          status !== "processing" && temporaryFileIds.length > 0,
      )
      .map(cloneGeneration);
  }
}

interface GenerationFileCleanupRecord {
  jobId: string;
  userId: string;
  temporaryFileIds: string[];
  status: "processing" | "awaiting_confirmation" | "generating" | "succeeded" | "failed";
  updatedAt: string;
}

export interface GenerationFileCleanupRepositoryPort {
  listFileCleanupCandidates(): Promise<GenerationFileCleanupRecord[]>;
  save(record: GenerationFileCleanupRecord): Promise<void>;
}

export interface GenerationFileCleanupStoragePort {
  deleteOwnedFile(userId: string, fileId: string): Promise<boolean>;
}

export interface GenerationFileCleanupResult {
  candidates: number;
  deleted: number;
  remaining: number;
}

function isNotFound(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    Reflect.get(error, "code") === "NOT_FOUND"
  );
}

export class GenerationFileCleanupService {
  constructor(
    private readonly generations: GenerationFileCleanupRepositoryPort,
    private readonly files: GenerationFileCleanupStoragePort,
  ) {}

  async run(): Promise<GenerationFileCleanupResult> {
    const candidates = await this.generations.listFileCleanupCandidates();
    let deleted = 0;
    let remaining = 0;
    for (const record of candidates) {
      const residual: string[] = [];
      for (const fileId of record.temporaryFileIds) {
        try {
          if (await this.files.deleteOwnedFile(record.userId, fileId)) {
            deleted += 1;
          }
        } catch (error) {
          if (isNotFound(error)) {
            continue;
          }
          residual.push(fileId);
        }
      }
      remaining += residual.length;
      await this.generations.save({ ...record, temporaryFileIds: residual });
    }
    return { candidates: candidates.length, deleted, remaining };
  }
}

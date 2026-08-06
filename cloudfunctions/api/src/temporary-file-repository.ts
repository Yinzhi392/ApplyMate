import type { TemporaryFileRecord } from "./temporary-file-domain.js";

export interface TemporaryFileRepository {
  createFile(file: TemporaryFileRecord): Promise<void>;
  getFileById(fileId: string): Promise<TemporaryFileRecord | null>;
  deleteFile(fileId: string): Promise<boolean>;
  listFilesUploadedAtOrBefore(cutoff: Date): Promise<TemporaryFileRecord[]>;
  deleteByUserId(userId: string): Promise<number>;
}

function cloneFile(file: TemporaryFileRecord): TemporaryFileRecord {
  return {
    ...structuredClone({ ...file, bytes: undefined }),
    bytes: Buffer.from(file.bytes),
  } as TemporaryFileRecord;
}

export class InMemoryTemporaryFileRepository
  implements TemporaryFileRepository
{
  readonly #files = new Map<string, TemporaryFileRecord>();

  async createFile(file: TemporaryFileRecord): Promise<void> {
    if (this.#files.has(file.fileId)) {
      throw new Error("Temporary file identifier must be unique.");
    }
    this.#files.set(file.fileId, cloneFile(file));
  }

  async getFileById(fileId: string): Promise<TemporaryFileRecord | null> {
    const file = this.#files.get(fileId);
    return file === undefined ? null : cloneFile(file);
  }

  async deleteFile(fileId: string): Promise<boolean> {
    return this.#files.delete(fileId);
  }

  async listFilesUploadedAtOrBefore(cutoff: Date): Promise<TemporaryFileRecord[]> {
    return Array.from(this.#files.values())
      .filter(
        (file) => new Date(file.uploadedAt).getTime() <= cutoff.getTime(),
      )
      .map(cloneFile);
  }

  async deleteByUserId(userId: string): Promise<number> {
    let deleted = 0;
    for (const [fileId, file] of this.#files) {
      if (file.ownerUserId === userId && this.#files.delete(fileId)) {
        deleted += 1;
      }
    }
    return deleted;
  }
}

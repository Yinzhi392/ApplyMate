import { createHash, randomUUID } from "node:crypto";

import { DomainError } from "./domain-error.js";
import type {
  CreateTemporaryFileInput,
  TemporaryFileRecord,
} from "./temporary-file-domain.js";
import type { TemporaryFileRepository } from "./temporary-file-repository.js";

function createOwnerPathSegment(ownerUserId: string): string {
  return createHash("sha256")
    .update(`applymate-temporary-owner-v1\0${ownerUserId}`, "utf8")
    .digest("hex")
    .slice(0, 24);
}

export class TemporaryFileService {
  constructor(
    private readonly repository: TemporaryFileRepository,
    private readonly generateFileId: () => string = () =>
      `file_${randomUUID()}`,
  ) {}

  async createFile(
    ownerUserId: string,
    input: CreateTemporaryFileInput,
    now: Date,
  ): Promise<TemporaryFileRecord> {
    const fileId = this.generateFileId();
    const file: TemporaryFileRecord = {
      fileId,
      ownerUserId,
      storageKey: `temporary/resumes/${createOwnerPathSegment(ownerUserId)}/${fileId}`,
      originalName: input.originalName,
      mimeType: input.mimeType,
      bytes: Buffer.from(input.bytes),
      sizeBytes: input.bytes.byteLength,
      uploadedAt: now.toISOString(),
    };
    await this.repository.createFile(file);
    return file;
  }

  async getOwnedFile(
    ownerUserId: string,
    fileId: string,
  ): Promise<TemporaryFileRecord> {
    const file = await this.repository.getFileById(fileId);
    if (file === null || file.ownerUserId !== ownerUserId) {
      throw new DomainError("NOT_FOUND", "Temporary file was not found.");
    }
    return file;
  }

  async deleteOwnedFile(
    ownerUserId: string,
    fileId: string,
  ): Promise<boolean> {
    await this.getOwnedFile(ownerUserId, fileId);
    return this.repository.deleteFile(fileId);
  }

  listUploadedAtOrBefore(now: Date): Promise<TemporaryFileRecord[]> {
    return this.repository.listFilesUploadedAtOrBefore(now);
  }
}

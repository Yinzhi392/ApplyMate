import { DomainError } from "./domain-error.js";
import type { ResumeFileValidationService } from "./resume-file-validation-service.js";
import type { TemporaryFileService } from "./temporary-file-service.js";

export class ValidatedTemporaryFileAdapter {
  constructor(
    private readonly files: TemporaryFileService,
    private readonly validation: ResumeFileValidationService,
  ) {}

  async readValidatedFile(
    ownerUserId: string,
    fileId: string,
    inputType: "pdf" | "docx",
  ): Promise<{ fileId: string; bytes: Buffer } | null> {
    try {
      const file = await this.files.getOwnedFile(ownerUserId, fileId);
      const validated = this.validation.validate(inputType, [file])[0];
      return validated === undefined
        ? null
        : { fileId: validated.fileId, bytes: Buffer.from(validated.bytes) };
    } catch (error) {
      if (error instanceof DomainError) {
        return null;
      }
      throw error;
    }
  }

  async getValidatedImage(ownerUserId: string, fileId: string) {
    try {
      const file = await this.files.getOwnedFile(ownerUserId, fileId);
      const validated = this.validation.validate("images", [file])[0];
      return validated === undefined
        ? null
        : {
            fileId: validated.fileId,
            ownerUserId: validated.ownerUserId,
            mimeType: validated.mimeType,
            bytes: Buffer.from(validated.bytes),
            validatedKind: "images" as const,
          };
    } catch (error) {
      if (error instanceof DomainError) {
        return null;
      }
      throw error;
    }
  }
}

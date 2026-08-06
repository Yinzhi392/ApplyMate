import {
  MAX_IMAGE_TOTAL_BYTES,
  MAX_RESUME_IMAGE_COUNT,
  MAX_SINGLE_FILE_BYTES,
} from "../../../shared/src/index.js";

import { DomainError } from "./domain-error.js";
import type { TemporaryFileRecord } from "./temporary-file-domain.js";

export type ResumeUploadKind = "pdf" | "docx" | "images";

interface FileSignatureRule {
  extensions: ReadonlySet<string>;
  mimeTypes: ReadonlySet<string>;
  matches(bytes: Buffer): boolean;
}

function startsWith(bytes: Buffer, signature: readonly number[]): boolean {
  return (
    bytes.byteLength >= signature.length &&
    signature.every((value, index) => bytes[index] === value)
  );
}

const PDF_RULE: FileSignatureRule = {
  extensions: new Set(["pdf"]),
  mimeTypes: new Set(["application/pdf"]),
  matches: (bytes) => bytes.subarray(0, 5).toString("ascii") === "%PDF-",
};

const DOCX_RULE: FileSignatureRule = {
  extensions: new Set(["docx"]),
  mimeTypes: new Set([
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ]),
  matches: (bytes) => startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]),
};

const IMAGE_RULES: readonly FileSignatureRule[] = [
  {
    extensions: new Set(["jpg", "jpeg"]),
    mimeTypes: new Set(["image/jpeg"]),
    matches: (bytes) => startsWith(bytes, [0xff, 0xd8, 0xff]),
  },
  {
    extensions: new Set(["png"]),
    mimeTypes: new Set(["image/png"]),
    matches: (bytes) =>
      startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  },
  {
    extensions: new Set(["webp"]),
    mimeTypes: new Set(["image/webp"]),
    matches: (bytes) =>
      bytes.byteLength >= 12 &&
      bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
      bytes.subarray(8, 12).toString("ascii") === "WEBP",
  },
];

function extensionOf(name: string): string {
  const index = name.lastIndexOf(".");
  return index < 0 ? "" : name.slice(index + 1).toLowerCase();
}

function matchesRule(file: TemporaryFileRecord, rule: FileSignatureRule): boolean {
  return (
    rule.extensions.has(extensionOf(file.originalName)) &&
    rule.mimeTypes.has(file.mimeType.toLowerCase()) &&
    rule.matches(file.bytes)
  );
}

function invalidFile(): never {
  throw new DomainError("INVALID_REQUEST", "Resume file is invalid.");
}

export class ResumeFileValidationService {
  validate(
    kind: ResumeUploadKind,
    files: readonly TemporaryFileRecord[],
  ): TemporaryFileRecord[] {
    if (
      files.length === 0 ||
      (kind === "images"
        ? files.length > MAX_RESUME_IMAGE_COUNT
        : files.length !== 1)
    ) {
      invalidFile();
    }

    let totalBytes = 0;
    for (const file of files) {
      if (
        file.bytes.byteLength !== file.sizeBytes ||
        file.sizeBytes <= 0 ||
        file.sizeBytes > MAX_SINGLE_FILE_BYTES
      ) {
        invalidFile();
      }
      const validType =
        kind === "pdf"
          ? matchesRule(file, PDF_RULE)
          : kind === "docx"
            ? matchesRule(file, DOCX_RULE)
            : IMAGE_RULES.some((rule) => matchesRule(file, rule));
      if (!validType) {
        invalidFile();
      }
      totalBytes += file.sizeBytes;
    }

    if (kind === "images" && totalBytes > MAX_IMAGE_TOTAL_BYTES) {
      invalidFile();
    }
    return files.map((file) => ({ ...file, bytes: Buffer.from(file.bytes) }));
  }
}

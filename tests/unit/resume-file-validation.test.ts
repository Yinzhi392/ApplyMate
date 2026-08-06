import { describe, expect, it } from "vitest";

import {
  MAX_RESUME_IMAGE_COUNT,
  MAX_IMAGE_TOTAL_BYTES,
  MAX_SINGLE_FILE_BYTES,
} from "../../shared/src/index.js";
import {
  ResumeFileValidationService,
  type ResumeUploadKind,
  type TemporaryFileRecord,
} from "../../cloudfunctions/api/src/index.js";

function file(
  originalName: string,
  mimeType: string,
  bytes: Buffer,
  index = 0,
): TemporaryFileRecord {
  return {
    fileId: `file_synthetic_${index}`,
    ownerUserId: "user_synthetic",
    storageKey: `temporary/synthetic/${index}`,
    originalName,
    mimeType,
    bytes,
    sizeBytes: bytes.byteLength,
    uploadedAt: "2026-08-05T12:00:00.000Z",
  };
}

const validCases: readonly [ResumeUploadKind, string, string, Buffer][] = [
  ["pdf", "resume.pdf", "application/pdf", Buffer.from("%PDF-1.7")],
  [
    "docx",
    "resume.docx",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    Buffer.from([0x50, 0x4b, 0x03, 0x04]),
  ],
  ["images", "resume.jpg", "image/jpeg", Buffer.from([0xff, 0xd8, 0xff])],
  [
    "images",
    "resume.png",
    "image/png",
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  ],
  [
    "images",
    "resume.webp",
    "image/webp",
    Buffer.from("RIFF0000WEBP"),
  ],
];

describe("resume file validation", () => {
  it.each(validCases)(
    "accepts valid %s bytes at the single-file size limit",
    (kind, name, mime, header) => {
      const bytes = Buffer.alloc(MAX_SINGLE_FILE_BYTES);
      header.copy(bytes);
      const result = new ResumeFileValidationService().validate(kind, [
        file(name, mime, bytes),
      ]);

      expect(result).toHaveLength(1);
      expect(result[0]?.fileId).toBe("file_synthetic_0");
    },
  );

  it.each([
    ["pdf", "resume.docx", "application/pdf", Buffer.from("%PDF-1.7")],
    ["pdf", "resume.pdf", "text/plain", Buffer.from("%PDF-1.7")],
    ["pdf", "resume.pdf", "application/pdf", Buffer.from("not-pdf")],
    [
      "docx",
      "resume.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      Buffer.from("not-zip"),
    ],
    ["images", "resume.gif", "image/gif", Buffer.from("GIF89a")],
    ["images", "resume.jpg", "image/jpeg", Buffer.from([0xff, 0xd8])],
  ] as const)(
    "rejects mismatched or damaged %s input",
    (kind, name, mime, bytes) => {
      expect(() =>
        new ResumeFileValidationService().validate(kind, [
          file(name, mime, bytes),
        ]),
      ).toThrowError(expect.objectContaining({ code: "INVALID_REQUEST" }));
    },
  );

  it("enforces file count, per-file size, and aggregate image size", () => {
    const validator = new ResumeFileValidationService();
    const jpeg = Buffer.from([0xff, 0xd8, 0xff]);
    const sixImages = Array.from({ length: MAX_RESUME_IMAGE_COUNT }, (_, index) =>
      file(`resume-${index}.jpg`, "image/jpeg", jpeg, index),
    );
    expect(validator.validate("images", sixImages)).toHaveLength(MAX_RESUME_IMAGE_COUNT);

    expect(() =>
      validator.validate("images", [
        ...sixImages,
        file("resume-extra.jpg", "image/jpeg", jpeg, 7),
      ]),
    ).toThrowError(expect.objectContaining({ code: "INVALID_REQUEST" }));
    expect(() =>
      validator.validate("pdf", [
        file(
          "resume.pdf",
          "application/pdf",
          Buffer.concat([
            Buffer.from("%PDF-1.7"),
            Buffer.alloc(MAX_SINGLE_FILE_BYTES),
          ]),
        ),
      ]),
    ).toThrowError(expect.objectContaining({ code: "INVALID_REQUEST" }));

    const first = Buffer.alloc(Math.floor(MAX_IMAGE_TOTAL_BYTES / 2) + 1);
    const second = Buffer.alloc(Math.floor(MAX_IMAGE_TOTAL_BYTES / 2));
    Buffer.from([0xff, 0xd8, 0xff]).copy(first);
    Buffer.from([0xff, 0xd8, 0xff]).copy(second);
    expect(() =>
      validator.validate("images", [
        file("first.jpg", "image/jpeg", first, 1),
        file("second.jpg", "image/jpeg", second, 2),
      ]),
    ).toThrowError(expect.objectContaining({ code: "INVALID_REQUEST" }));
  });
});

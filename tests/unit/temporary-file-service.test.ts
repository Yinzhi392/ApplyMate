import { describe, expect, it } from "vitest";

import {
  InMemoryTemporaryFileRepository,
  TemporaryFileService,
} from "../../cloudfunctions/api/src/index.js";

const uploadedAt = new Date("2026-08-05T12:00:00.000Z");

describe("temporary resume files", () => {
  it("isolates same-named uploads by internal user and hides identity from paths", async () => {
    let sequence = 0;
    const repository = new InMemoryTemporaryFileRepository();
    const service = new TemporaryFileService(repository, () => {
      sequence += 1;
      return `file_synthetic_${sequence}`;
    });

    const first = await service.createFile(
      "user_internal_a",
      {
        originalName: "resume.pdf",
        mimeType: "application/pdf",
        bytes: Buffer.from("%PDF-synthetic-a"),
      },
      uploadedAt,
    );
    const second = await service.createFile(
      "user_internal_b",
      {
        originalName: "resume.pdf",
        mimeType: "application/pdf",
        bytes: Buffer.from("%PDF-synthetic-b"),
      },
      uploadedAt,
    );

    expect(first.fileId).not.toBe(second.fileId);
    expect(first.storageKey).not.toBe(second.storageKey);
    expect(first.storageKey).not.toContain("resume.pdf");
    expect(first.storageKey).not.toContain("wx_");
    await expect(
      service.getOwnedFile("user_internal_a", first.fileId),
    ).resolves.toMatchObject({ ownerUserId: "user_internal_a" });
    await expect(
      service.getOwnedFile("user_internal_b", first.fileId),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("deletes only an owned file and makes repeated or cross-user access indistinguishable", async () => {
    const service = new TemporaryFileService(
      new InMemoryTemporaryFileRepository(),
      () => "file_synthetic_delete",
    );
    const file = await service.createFile(
      "user_internal_a",
      {
        originalName: "resume.docx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        bytes: Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      },
      uploadedAt,
    );

    await expect(
      service.deleteOwnedFile("user_internal_b", file.fileId),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      service.deleteOwnedFile("user_internal_a", file.fileId),
    ).resolves.toBe(true);
    await expect(
      service.getOwnedFile("user_internal_a", file.fileId),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      service.deleteOwnedFile("user_internal_a", file.fileId),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

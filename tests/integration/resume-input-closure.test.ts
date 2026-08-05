import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  AgreementService,
  InMemoryIdentityRepository,
  InMemoryJobRepository,
  InMemoryResumeRepository,
  InMemoryTemporaryFileRepository,
  JobService,
  ResumeConfirmationService,
  ResumeFileValidationService,
  ResumeManagementService,
  ResumeParseExecutionService,
  ResumeTextValidationService,
  ResumeWorkflowService,
  TemporaryFileService,
  UserService,
  ValidatedTemporaryFileAdapter,
  createIdentityAccessApi,
} from "../../cloudfunctions/api/src/index.js";
import {
  DocxTextExtractor,
  PdfTextExtractor,
  ResumeParsePipeline,
  ResumeStructureParser,
  TencentOcrAdapter,
  type OcrProviderInput,
} from "../../cloudfunctions/worker/src/index.js";

const NOW = new Date("2026-08-05T17:00:00.000Z");
const VERSIONS = {
  userAgreementVersion: "user-2026-08",
  privacyPolicyVersion: "privacy-2026-08",
};

function escapePdfText(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}

function syntheticPdf(text: string): Buffer {
  const content = `BT /F1 12 Tf 72 720 Td (${escapePdfText(text)}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Count 1 /Kids [3 0 R] >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${offset.toString().padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, "ascii");
}

function responseField(response: unknown, field: string): string {
  if (
    response === null ||
    typeof response !== "object" ||
    !Reflect.get(response, "ok")
  ) {
    throw new Error("Expected a successful response.");
  }
  const data = Reflect.get(response, "data");
  const value =
    data !== null && typeof data === "object"
      ? Reflect.get(data, field)
      : undefined;
  if (typeof value !== "string") {
    throw new Error(`Expected ${field}.`);
  }
  return value;
}

describe("four resume input closure", () => {
  it.each([
    ["text", 0],
    ["pdf", 1],
    ["docx", 2],
    ["images", 3],
  ] as const)(
    "completes parse, confirmation, deletion, and default for %s",
    async (inputType, caseIndex) => {
      const openId = `wx_closure_${inputType}`;
      const identities = new InMemoryIdentityRepository();
      const user = await new UserService(identities).getOrCreateUser(openId, NOW);
      await new AgreementService(identities, VERSIONS).acceptAgreements(
        user,
        VERSIONS,
        NOW,
      );
      const fileRepository = new InMemoryTemporaryFileRepository();
      let fileSequence = 0;
      const temporaryFiles = new TemporaryFileService(
        fileRepository,
        () => `file_closure_${inputType}_${++fileSequence}`,
      );
      const validation = new ResumeFileValidationService();
      const fileAdapter = new ValidatedTemporaryFileAdapter(
        temporaryFiles,
        validation,
      );
      const jobs = new JobService(
        new InMemoryJobRepository(),
        () => `job_closure_${inputType}`,
      );
      const resumes = new InMemoryResumeRepository();
      const dispatched: string[] = [];
      const workflow = new ResumeWorkflowService({
        resumes,
        temporaryFiles,
        fileValidation: validation,
        textValidation: new ResumeTextValidationService(),
        jobs,
        dispatcher: { dispatch: (jobId) => dispatched.push(jobId) },
        generateResumeId: () => `resume_closure_${inputType}`,
      });
      const confirmations = new ResumeConfirmationService(
        resumes,
        temporaryFiles,
        jobs,
      );
      const management = new ResumeManagementService(
        resumes,
        temporaryFiles,
        jobs,
      );
      const api = createIdentityAccessApi({
        repository: identities,
        jobs,
        resumes: workflow,
        confirmations,
        management,
        currentVersions: VERSIONS,
        adminOpenIds: [openId],
        now: () => NOW,
        readCloudBaseContext: () => ({ OPENID: openId }),
      });

      const createdFileIds: string[] = [];
      let payload: Record<string, unknown>;
      if (inputType === "text") {
        payload = { inputType, text: "产品实习，手机13812345678" };
      } else if (inputType === "pdf") {
        const file = await temporaryFiles.createFile(
          user.userId,
          {
            originalName: "resume.pdf",
            mimeType: "application/pdf",
            bytes: syntheticPdf("Product intern candidate@example.com"),
          },
          NOW,
        );
        createdFileIds.push(file.fileId);
        payload = { inputType, fileId: file.fileId };
      } else if (inputType === "docx") {
        const file = await temporaryFiles.createFile(
          user.userId,
          {
            originalName: "resume.docx",
            mimeType:
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            bytes: await readFile(
              resolve(
                "node_modules/mammoth/test/test-data/single-paragraph.docx",
              ),
            ),
          },
          NOW,
        );
        createdFileIds.push(file.fileId);
        payload = { inputType, fileId: file.fileId };
      } else {
        const first = await temporaryFiles.createFile(
          user.userId,
          {
            originalName: "resume-1.png",
            mimeType: "image/png",
            bytes: Buffer.from([
              0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
            ]),
          },
          NOW,
        );
        const second = await temporaryFiles.createFile(
          user.userId,
          {
            originalName: "resume-2.jpg",
            mimeType: "image/jpeg",
            bytes: Buffer.from([0xff, 0xd8, 0xff, 0x00]),
          },
          NOW,
        );
        createdFileIds.push(first.fileId, second.fileId);
        payload = { inputType, fileIds: createdFileIds };
      }

      const parseResponse = await api({
        action: "resume.parse",
        payload,
        requestId: `5000010${caseIndex + 1}-1234-4234-a234-123456789abc`,
      });
      const jobId = responseField(parseResponse, "jobId");
      const resumeId = responseField(parseResponse, "resumeId");
      expect(dispatched).toEqual([jobId]);

      const ocrCalls: OcrProviderInput[] = [];
      const modelCalls: string[] = [];
      const ocr = new TencentOcrAdapter(fileAdapter, {
        recognize: async (input) => {
          ocrCalls.push(input);
          return {
            text:
              ocrCalls.length === 1
                ? "产品实习，手机13812345678"
                : "邮箱candidate@example.com",
            confidence: 0.99,
            providerRequestId: `ocr_${ocrCalls.length}`,
            durationMs: 1,
            usageUnits: 1,
          };
        },
      });
      const parser = new ResumeStructureParser({
        parseStructuredResume: async (text) => {
          modelCalls.push(text);
          return {
            name: "合成候选人",
            education: [],
            experiences: [],
            projects: [],
            skills: [{ name: "产品分析", text: "具备产品分析能力" }],
            languages: [],
            certificates: [],
            achievements: [],
            otherFacts: [],
          };
        },
      });
      const pipeline = new ResumeParsePipeline({
        files: fileAdapter,
        docx: new DocxTextExtractor(),
        pdf: new PdfTextExtractor(),
        ocr,
        parser,
      });
      await new ResumeParseExecutionService(
        jobs,
        resumes,
        pipeline,
        () => NOW,
      ).run(jobId, `worker_${inputType}`, NOW);

      const waiting = await resumes.getById(resumeId);
      expect(waiting).toMatchObject({
        status: "awaiting_confirmation",
        profile: { confirmed: false },
      });
      const confirmResponse = await api({
        action: "resume.confirm",
        payload: { resumeId, profile: waiting?.profile },
        requestId: `5000020${caseIndex + 1}-1234-4234-a234-123456789abc`,
      });
      expect(confirmResponse).toMatchObject({
        ok: true,
        data: { isDefault: true, profile: { confirmed: true } },
      });
      await expect(
        api({ action: "resume.list", payload: {} }),
      ).resolves.toMatchObject({
        ok: true,
        data: {
          resumes: [
            { resumeId, status: "confirmed", isDefault: true },
          ],
        },
      });
      for (const fileId of createdFileIds) {
        await expect(
          temporaryFiles.getOwnedFile(user.userId, fileId),
        ).rejects.toMatchObject({ code: "NOT_FOUND" });
      }

      expect(modelCalls).toHaveLength(1);
      expect(modelCalls[0]).not.toContain("13812345678");
      expect(modelCalls[0]).not.toContain("candidate@example.com");
      if (inputType === "images") {
        expect(ocrCalls).toHaveLength(2);
        expect(ocrCalls.every(({ bytes }) => Buffer.isBuffer(bytes))).toBe(true);
        expect(modelCalls[0]).toContain("[MASKED:phone]");
        expect(modelCalls[0]).toContain("[MASKED:email]");
      } else {
        expect(ocrCalls).toHaveLength(0);
      }
    },
  );
});

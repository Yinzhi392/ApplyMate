export interface LocalResumeTextPayload {
  inputType: "text";
  text: string;
}

interface UploadedResumeFile {
  accessUrl: string;
  fileId: string;
}

type UploadResumeFiles = (files: readonly File[]) => Promise<readonly UploadedResumeFile[]>;

function isSinglePdf(files: readonly File[]): files is readonly [File] {
  if (files.length !== 1) return false;
  const file = files[0];
  if (file === undefined) return false;
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

export async function extractLocalResumeText(
  files: readonly File[],
): Promise<LocalResumeTextPayload | undefined> {
  if (!isSinglePdf(files)) return undefined;

  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const bytes = new Uint8Array(await files[0].arrayBuffer());
    const pdf = await getDocumentProxy(bytes);
    const extracted = await extractText(pdf, { mergePages: true });
    const text = extracted.text.replaceAll("\u0000", "").replace(/\s+/gu, " ").trim();
    return text.length > 20 ? { inputType: "text", text } : undefined;
  } catch {
    // Image-only, encrypted, or uncommon PDFs continue through the existing
    // CloudBase/OCR path instead of blocking the user in the browser.
    return undefined;
  }
}

export async function prepareResumeFilePayload(
  files: readonly File[],
  uploadFiles: UploadResumeFiles,
): Promise<Record<string, unknown>> {
  const first = files[0];
  if (first === undefined) throw new Error("请先选择简历文件。");

  const localText = await extractLocalResumeText(files);
  if (localText !== undefined) return { ...localText };

  const uploads = await uploadFiles(files);
  const fileIds = uploads.map(({ fileId }) => fileId);
  const fileAccessUrls = uploads.map(({ accessUrl }) => accessUrl);
  const extension = first.name.toLowerCase().split(".").pop();
  if (files.length > 1 || first.type.startsWith("image/")) {
    return { inputType: "images", fileIds, fileAccessUrls };
  }
  return extension === "pdf"
    ? { inputType: "pdf", fileIds, fileAccessUrls }
    : { inputType: "docx", fileIds, fileAccessUrls };
}

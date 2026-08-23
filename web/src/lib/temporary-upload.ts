import { requireCloudbaseApp } from "./cloudbase-app";
import {
  createTemporaryUploadPort,
  uploadWithConcurrency as uploadWithPortConcurrency,
  type StorageDiagnostic,
  type TemporaryUpload,
  type TemporaryUploadPort,
} from "./temporary-upload-adapter";

export type { TemporaryUpload, TemporaryUploadPort } from "./temporary-upload-adapter";

function reportStorageDiagnostic(diagnostic: StorageDiagnostic): void {
  if (import.meta.env.DEV) console.error("[ApplyMate storage]", diagnostic);
}

export const cloudbaseTemporaryUploadPort = createTemporaryUploadPort(
  requireCloudbaseApp,
  reportStorageDiagnostic,
);

export function uploadWithConcurrency(
  files: readonly File[],
  ownerId: string,
  limit = 3,
  port: TemporaryUploadPort = cloudbaseTemporaryUploadPort,
): Promise<TemporaryUpload[]> {
  return uploadWithPortConcurrency(files, ownerId, limit, port);
}

import { requireCloudbaseApp } from "./cloudbase-app";
import {
  createTemporaryUploadPort,
  uploadWithConcurrency as uploadWithPortConcurrency,
  type TemporaryUpload,
  type TemporaryUploadPort,
} from "./temporary-upload-adapter";

export type { TemporaryUpload, TemporaryUploadPort } from "./temporary-upload-adapter";

export const cloudbaseTemporaryUploadPort = createTemporaryUploadPort(requireCloudbaseApp);

export function uploadWithConcurrency(
  files: readonly File[],
  ownerId: string,
  limit = 3,
  port: TemporaryUploadPort = cloudbaseTemporaryUploadPort,
): Promise<TemporaryUpload[]> {
  return uploadWithPortConcurrency(files, ownerId, limit, port);
}

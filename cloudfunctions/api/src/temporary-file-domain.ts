export interface TemporaryFileRecord {
  fileId: string;
  ownerUserId: string;
  storageKey: string;
  originalName: string;
  mimeType: string;
  bytes: Buffer;
  sizeBytes: number;
  uploadedAt: string;
}

export interface CreateTemporaryFileInput {
  originalName: string;
  mimeType: string;
  bytes: Buffer;
}

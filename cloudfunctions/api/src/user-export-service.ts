import { Buffer } from "node:buffer";

import { DomainError } from "./domain-error.js";

export const USER_EXPORT_VERSION = "applymate-user-export-v1";
export const USER_EXPORT_DEFAULT_PAGE_SIZE = 100;
export const USER_EXPORT_MAX_PAGE_SIZE = 200;

const PRIVATE_FIELDS = new Set([
  "email",
  "emailAddress",
  "identityHash",
  "openid",
  "openId",
  "OPENID",
  "uid",
  "userId",
]);

export interface UserExportRecord {
  collection: string;
  recordId: string;
  userId: string;
  data: Record<string, unknown>;
}

export interface UserExportRepository {
  listForUser(userId: string): Promise<UserExportRecord[]>;
}

export interface UserExportPage {
  version: typeof USER_EXPORT_VERSION;
  exportedAt: string;
  records: Array<{
    collection: string;
    recordId: string;
    data: Record<string, unknown>;
  }>;
  nextCursor: string | null;
}

function stripPrivateFields(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripPrivateFields);
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (!PRIVATE_FIELDS.has(key)) {
      output[key] = stripPrivateFields(child);
    }
  }
  return output;
}

function recordKey(record: Pick<UserExportRecord, "collection" | "recordId">): string {
  return `${record.collection}\0${record.recordId}`;
}

function encodeCursor(key: string): string {
  return Buffer.from(key, "utf8").toString("base64url");
}

function decodeCursor(cursor: string): string {
  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    if (!decoded.includes("\0") || decoded.length > 300) throw new Error("invalid");
    return decoded;
  } catch {
    throw new DomainError("INVALID_REQUEST", "Export cursor is invalid.");
  }
}

export class InMemoryUserExportRepository implements UserExportRepository {
  constructor(private readonly records: readonly UserExportRecord[]) {}

  async listForUser(userId: string): Promise<UserExportRecord[]> {
    return this.records
      .filter((record) => record.userId === userId)
      .map((record) => structuredClone(record));
  }
}

export class UserExportService {
  constructor(private readonly repository: UserExportRepository) {}

  async getPage(
    userId: string,
    input: { cursor?: string; limit?: number },
    now: Date,
  ): Promise<UserExportPage> {
    const limit = input.limit ?? USER_EXPORT_DEFAULT_PAGE_SIZE;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > USER_EXPORT_MAX_PAGE_SIZE) {
      throw new DomainError("INVALID_REQUEST", "Export page size is invalid.");
    }
    const afterKey = input.cursor === undefined ? undefined : decodeCursor(input.cursor);
    const records = (await this.repository.listForUser(userId))
      .sort((left, right) => recordKey(left).localeCompare(recordKey(right)));
    const start = afterKey === undefined
      ? 0
      : records.findIndex((record) => recordKey(record) > afterKey);
    const pageStart = start < 0 ? records.length : start;
    const selected = records.slice(pageStart, pageStart + limit);
    const last = selected.at(-1);
    return {
      version: USER_EXPORT_VERSION,
      exportedAt: now.toISOString(),
      records: selected.map((record) => ({
        collection: record.collection,
        recordId: record.recordId,
        data: stripPrivateFields(record.data) as Record<string, unknown>,
      })),
      nextCursor: pageStart + selected.length < records.length && last !== undefined
        ? encodeCursor(recordKey(last))
        : null,
    };
  }
}

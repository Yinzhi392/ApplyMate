import { callApi } from "./api";

interface UserExportPage {
  exportedAt: string;
  nextCursor: string | null;
  records: Array<{
    collection: string;
    recordId: string;
    data: Record<string, unknown>;
  }>;
  version: string;
}

export async function downloadUserExport(): Promise<number> {
  const records: UserExportPage["records"] = [];
  let cursor: string | undefined;
  let version = "applymate-user-export-v1";
  let exportedAt = new Date().toISOString();
  do {
    const page = await callApi<UserExportPage>("user.export", {
      limit: 100,
      ...(cursor === undefined ? {} : { cursor }),
    });
    records.push(...page.records);
    version = page.version;
    exportedAt = page.exportedAt;
    cursor = page.nextCursor ?? undefined;
  } while (cursor !== undefined);
  const blob = new Blob([
    `${JSON.stringify({ version, exportedAt, records }, null, 2)}\n`,
  ], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = `applymate-export-${exportedAt.slice(0, 10)}.json`;
    link.click();
  } finally {
    URL.revokeObjectURL(url);
  }
  return records.length;
}

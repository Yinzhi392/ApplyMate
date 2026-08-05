import { createHash } from "node:crypto";

export const FACT_SOURCE_TYPES = [
  "education",
  "experience",
  "project",
  "skill",
  "language",
  "certificate",
  "achievement",
  "preference",
  "other",
] as const;

export type FactSourceType = (typeof FACT_SOURCE_TYPES)[number];

export function normalizeFactText(value: string): string {
  return value.normalize("NFC").trim().replace(/\s+/gu, " ");
}

export function hashFactText(value: string): string {
  return createHash("sha256").update(normalizeFactText(value), "utf8").digest("hex");
}

export function createFactId(sourceType: FactSourceType, value: string): string {
  const digest = createHash("sha256")
    .update(`applymate-fact-v1\0${sourceType}\0${normalizeFactText(value)}`, "utf8")
    .digest("hex")
    .slice(0, 24);

  return `fact_${digest}`;
}

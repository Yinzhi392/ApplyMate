import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

import { scanSensitiveContent } from "./sensitive-scan-lib.mjs";

const root = process.cwd();
const ignoredDirectories = new Set([
  ".git",
  ".worktrees",
  "coverage",
  "dist",
  "node_modules",
]);
const ignoredFiles = new Set([
  "project.config.json",
  "project.private.config.json",
  "tests/unit/sensitive-scan.test.ts",
]);
const textExtensions = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".mts",
  ".ts",
  ".wxml",
  ".wxss",
  ".yaml",
  ".yml",
]);
const explicitTextFiles = new Set([".env.example", ".gitignore"]);
const failures = [];

function collectFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    if (ignoredDirectories.has(entry)) {
      continue;
    }
    const absolutePath = join(directory, entry);
    const stats = statSync(absolutePath);
    if (stats.isDirectory()) {
      files.push(...collectFiles(absolutePath));
    } else {
      files.push(absolutePath);
    }
  }
  return files;
}

for (const absolutePath of collectFiles(root)) {
  const filePath = relative(root, absolutePath);
  if (ignoredFiles.has(filePath)) {
    continue;
  }
  const extension = extname(absolutePath).toLowerCase();
  if (!textExtensions.has(extension) && !explicitTextFiles.has(filePath)) {
    if (/(?:^|\/)(?:exports?|production|uploads?)(?:\/|$)/u.test(filePath)) {
      failures.push(`${filePath}: production-like binary artifact is not allowed`);
    }
    continue;
  }
  const content = readFileSync(absolutePath, "utf8");
  failures.push(...scanSensitiveContent(filePath, content));
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Sensitive information scan passed.");
}

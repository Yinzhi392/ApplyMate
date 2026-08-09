import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const root = process.cwd();
const ignoredDirectories = new Set([".git", ".worktrees", "coverage", "dist", "node_modules"]);
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
const developerToolFiles = new Set(["project.config.json", "project.private.config.json"]);
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
      continue;
    }

    if (textExtensions.has(extname(entry)) || explicitTextFiles.has(entry)) {
      files.push(absolutePath);
    }
  }

  return files;
}

for (const absolutePath of collectFiles(root)) {
  const filePath = relative(root, absolutePath);
  if (developerToolFiles.has(filePath)) {
    continue;
  }
  const content = readFileSync(absolutePath, "utf8");

  if (content.startsWith("\uFEFF")) {
    failures.push(`${filePath}: UTF-8 BOM is not allowed`);
  }

  if (content.includes("\r")) {
    failures.push(`${filePath}: use LF line endings`);
  }

  if (!content.endsWith("\n")) {
    failures.push(`${filePath}: missing final newline`);
  }

  content.split("\n").forEach((line, index) => {
    if (/[ \t]+$/u.test(line)) {
      failures.push(`${filePath}:${index + 1}: trailing whitespace`);
    }
  });

  if (extname(filePath) === ".json") {
    try {
      const normalized = `${JSON.stringify(JSON.parse(content), null, 2)}\n`;
      if (content !== normalized) {
        failures.push(`${filePath}: JSON must use two-space canonical formatting`);
      }
    } catch {
      failures.push(`${filePath}: invalid JSON`);
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Format check passed.");
}

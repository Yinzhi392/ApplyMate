import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const fixtureRoot = join(process.cwd(), "tests", "fixtures");
const syntheticMarker = "SYNTHETIC_FIXTURE: true";
const textExtensions = new Set([".json", ".md", ".txt", ".yaml", ".yml"]);
const sensitivePatterns = [
  { label: "mainland mobile number", pattern: /(?<!\d)1[3-9]\d{9}(?!\d)/u },
  { label: "email address", pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu },
  { label: "identity number", pattern: /(?<!\d)\d{17}[\dXx](?!\d)/u },
];
const failures = [];

function collectFiles(directory) {
  const files = [];

  for (const entry of readdirSync(directory)) {
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

for (const absolutePath of collectFiles(fixtureRoot)) {
  const filePath = relative(process.cwd(), absolutePath);
  const extension = extname(absolutePath).toLowerCase();

  if (!textExtensions.has(extension)) {
    const sidecarPath = `${absolutePath}.fixture.json`;
    try {
      const metadata = JSON.parse(readFileSync(sidecarPath, "utf8"));
      if (metadata.synthetic !== true) {
        failures.push(`${filePath}: binary fixture sidecar must set synthetic=true`);
      }
    } catch {
      failures.push(`${filePath}: binary fixture requires a valid .fixture.json sidecar`);
    }
    continue;
  }

  const content = readFileSync(absolutePath, "utf8");
  if (!content.includes(syntheticMarker)) {
    failures.push(`${filePath}: missing ${syntheticMarker}`);
  }

  for (const { label, pattern } of sensitivePatterns) {
    if (pattern.test(content) && !content.includes(syntheticMarker)) {
      failures.push(`${filePath}: possible ${label} without synthetic marker`);
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Fixture isolation check passed.");
}


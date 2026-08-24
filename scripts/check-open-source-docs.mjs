import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = process.cwd();
const publicDocuments = [
  "README.md",
  "README.en.md",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "ROADMAP.md",
  "CHANGELOG.md",
];
const requiredFiles = [
  ...publicDocuments,
  "LICENSE",
  "docs/open-source/applymate-hero.svg",
  "docs/open-source/landing-hero.png",
  "docs/open-source/landing-steps.png",
  "docs/open-source/landing-about.png",
  ".github/CODEOWNERS",
  ".github/PULL_REQUEST_TEMPLATE.md",
  ".github/ISSUE_TEMPLATE/bug_report.yml",
  ".github/ISSUE_TEMPLATE/feature_request.yml",
  ".github/ISSUE_TEMPLATE/config.yml",
  ".github/workflows/ci.yml",
];
const failures = [];

for (const filePath of requiredFiles) {
  if (!existsSync(resolve(root, filePath))) {
    failures.push(`${filePath}: required open-source file is missing`);
  }
}

function checkTarget(documentPath, target) {
  if (
    target.length === 0 ||
    target.startsWith("#") ||
    /^(?:https?:|mailto:)/u.test(target)
  ) {
    return;
  }

  const pathWithoutFragment = decodeURIComponent(target.split("#", 1)[0]);
  const absoluteTarget = resolve(root, dirname(documentPath), pathWithoutFragment);
  if (!existsSync(absoluteTarget)) {
    failures.push(`${documentPath}: broken relative link ${target}`);
  }
}

for (const documentPath of publicDocuments) {
  const content = readFileSync(resolve(root, documentPath), "utf8");
  for (const match of content.matchAll(/!?(?:\[[^\]]*\])\(([^)\s]+)(?:\s+"[^"]*")?\)/gu)) {
    checkTarget(documentPath, match[1]);
  }
  for (const match of content.matchAll(/\bsrc="([^"]+)"/gu)) {
    checkTarget(documentPath, match[1]);
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Open-source documentation check passed.");
}

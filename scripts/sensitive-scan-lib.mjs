const PROJECT_CONTACT_EMAIL = "applymate67@gmail.com";
const SYNTHETIC_MARKER = "SYNTHETIC_FIXTURE: true";

const unconditionalPatterns = [
  {
    label: "private key",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u,
  },
  {
    label: "live API secret",
    pattern: /\b(?:sk|key)-(?:live|prod)-[A-Za-z0-9_-]{20,}\b/u,
  },
  {
    label: "Tencent Cloud secret identifier",
    pattern: /\bAKID[A-Za-z0-9]{24,}\b/u,
  },
  {
    label: "real OpenID-like value",
    pattern:
      /(?:OPENID|openid|openId)["']?\s*[:=]\s*["']o[A-Za-z0-9_-]{27,31}["']/u,
  },
];

const personalPatterns = [
  { label: "mainland mobile number", pattern: /(?<!\d)1[3-9]\d{9}(?!\d)/gu },
  { label: "identity number", pattern: /(?<!\d)\d{17}[\dXx](?!\d)/gu },
  {
    label: "email address",
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu,
  },
];

export function scanSensitiveContent(filePath, content) {
  const failures = [];
  const synthetic =
    content.includes(SYNTHETIC_MARKER) ||
    filePath.replaceAll("\\", "/").startsWith("tests/");
  const normalizedPath = filePath.replaceAll("\\", "/").toLowerCase();

  for (const { label, pattern } of unconditionalPatterns) {
    if (pattern.test(content)) {
      failures.push(`${filePath}: possible ${label}`);
    }
  }

  if (!synthetic) {
    for (const { label, pattern } of personalPatterns) {
      const matches = [...content.matchAll(pattern)];
      const unsafeMatches = matches.filter(
        ([value]) =>
          value.toLowerCase() !== PROJECT_CONTACT_EMAIL &&
          !value.toLowerCase().endsWith(".invalid"),
      );
      if (unsafeMatches.length > 0) {
        failures.push(`${filePath}: possible ${label}`);
      }
    }
  }

  if (
    /(?:^|\/)(?:logs?|exports?|production)(?:\/|$)/u.test(normalizedPath) &&
    /"(?:resumeText|jdText|prompt|rawContent|originalText)"\s*:/u.test(content)
  ) {
    failures.push(`${filePath}: possible unmasked production content`);
  }

  return failures;
}

import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface, emitKeypressEvents } from "node:readline";

if (!process.stdin.isTTY) {
  throw new Error("Run this script in an interactive terminal.");
}

const outputPath = join(process.cwd(), ".env.phase0.local");
const terminal = createInterface({ input: process.stdin, output: process.stdout });

function readHidden(prompt) {
  return new Promise((resolve, reject) => {
    let value = "";
    process.stdout.write(prompt);
    const onKeypress = (character, key) => {
      if (key?.name === "return") {
        cleanup();
        process.stdout.write("\n");
        resolve(value.trim());
        return;
      }
      if (key?.name === "backspace") {
        value = value.slice(0, -1);
        return;
      }
      if (key?.ctrl && key.name === "c") {
        cleanup();
        process.stdout.write("\n");
        reject(new Error("Cancelled; no file was written."));
        return;
      }
      if (typeof character === "string" && !key?.ctrl && !key?.meta) value += character;
    };
    const cleanup = () => {
      process.stdin.off("keypress", onKeypress);
      process.stdin.setRawMode(false);
    };
    process.stdin.on("keypress", onKeypress);
    process.stdin.setRawMode(true);
  });
}

function replaceEnvironmentValue(content, key, value) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "mu");
  return pattern.test(content) ? content.replace(pattern, line) : `${content.trimEnd()}\n${line}\n`;
}

try {
  emitKeypressEvents(process.stdin, terminal);
  const secretId = await readHidden("Paste Tencent SecretId (input is hidden), then press Enter: ");
  const secretKey = await readHidden("Paste Tencent SecretKey (input is hidden), then press Enter: ");
  if (secretId.length < 8 || secretKey.length < 16) {
    throw new Error("Credentials are unexpectedly short; no file was written.");
  }
  const existing = existsSync(outputPath) ? readFileSync(outputPath, "utf8") : "";
  let updated = replaceEnvironmentValue(existing, "TENCENTCLOUD_SECRET_ID", secretId);
  updated = replaceEnvironmentValue(updated, "TENCENTCLOUD_SECRET_KEY", secretKey);
  updated = replaceEnvironmentValue(updated, "TENCENTCLOUD_REGION", "ap-shanghai");
  writeFileSync(outputPath, updated, { encoding: "utf8", mode: 0o600 });
  chmodSync(outputPath, 0o600);
  console.log("Saved OCR credentials to the untracked local environment file with mode 0600.");
} finally {
  terminal.close();
}

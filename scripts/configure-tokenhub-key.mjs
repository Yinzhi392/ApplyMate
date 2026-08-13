import { chmodSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface, emitKeypressEvents } from "node:readline";

if (!process.stdin.isTTY) {
  throw new Error("Run this script in an interactive terminal.");
}

const outputPath = join(process.cwd(), ".env.phase0.local");
const terminal = createInterface({ input: process.stdin, output: process.stdout });
emitKeypressEvents(process.stdin, terminal);
process.stdin.setRawMode(true);
process.stdout.write("Paste the restricted TokenHub API Key (input is hidden), then press Enter: ");

let secret = "";
process.stdin.on("keypress", (character, key) => {
  if (key?.name === "return") {
    process.stdin.setRawMode(false);
    terminal.close();
    process.stdout.write("\n");
    if (secret.trim().length < 16) {
      throw new Error("API Key is unexpectedly short; no file was written.");
    }
    const content = [
      `TOKENHUB_API_KEY=${secret.trim()}`,
      "TOKENHUB_BASE_URL=https://tokenhub.tencentmaas.com/v1",
      "TOKENHUB_PRIMARY_MODEL=deepseek-v4-flash",
      "TOKENHUB_FALLBACK_MODEL=hy3",
      "TOKENHUB_PAID_FALLBACK=disabled",
      "",
    ].join("\n");
    writeFileSync(outputPath, content, { encoding: "utf8", mode: 0o600 });
    chmodSync(outputPath, 0o600);
    secret = "";
    console.log("Saved the untracked stage 0.12 environment file with mode 0600.");
    return;
  }
  if (key?.name === "backspace") {
    secret = secret.slice(0, -1);
    return;
  }
  if (key?.ctrl && key.name === "c") {
    secret = "";
    process.stdin.setRawMode(false);
    terminal.close();
    process.stdout.write("\nCancelled; no file was written.\n");
    return;
  }
  if (typeof character === "string" && !key?.ctrl && !key?.meta) {
    secret += character;
  }
});

import react from "@vitejs/plugin-react";
import { gzipSync } from "node:zlib";

import { defineConfig, type Plugin } from "vite";

const INITIAL_JS_GZIP_LIMIT = 200 * 1024;

function initialJavaScriptBudget(): Plugin {
  return {
    name: "applymate-initial-js-budget",
    generateBundle(_options, bundle) {
      const chunks = Object.values(bundle).filter((asset) => asset.type === "chunk");
      const byFileName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
      const initialFiles = new Set<string>();
      const visit = (fileName: string): void => {
        if (initialFiles.has(fileName)) return;
        initialFiles.add(fileName);
        const chunk = byFileName.get(fileName);
        chunk?.imports.forEach(visit);
      };
      chunks.filter((chunk) => chunk.isEntry).forEach((chunk) => visit(chunk.fileName));
      const gzipBytes = [...initialFiles].reduce((total, fileName) => {
        const chunk = byFileName.get(fileName);
        return total + (chunk === undefined ? 0 : gzipSync(chunk.code).byteLength);
      }, 0);
      if (gzipBytes > INITIAL_JS_GZIP_LIMIT) {
        this.error(`Initial JavaScript gzip budget exceeded: ${gzipBytes} > ${INITIAL_JS_GZIP_LIMIT} bytes.`);
      }
    },
  };
}

export default defineConfig({
  root: "web",
  plugins: [react(), initialJavaScriptBudget()],
  publicDir: "public",
  build: {
    outDir: "../dist/web",
    emptyOutDir: true,
    sourcemap: false,
    target: "es2022",
  },
  server: {
    host: "127.0.0.1",
    port: 4173,
  },
});

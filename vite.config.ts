import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
export default defineConfig(({ command }) => {
  let token = "";
  let studyToken = "";
  if (command === "serve") {
    try {
      const localVars = parseEnv(
        readFileSync(new URL("./worker/.dev.vars", import.meta.url), "utf8"),
      );
      token = localVars.INGEST_TOKEN ?? "";
      studyToken = localVars.STUDY_ADMIN_TOKEN ?? "";
    } catch {
      /* Local backend is optional. */
    }
  }
  return {
    plugins: [react()],
    base: "/trading-copilot-alpha/",
    server: {
      host: "127.0.0.1",
      port: 5173,
      strictPort: true,
      proxy: {
        "^/study-cloud-config$": {
          target: "https://trading-copilot-study.dnyanesh-copilot.workers.dev",
          changeOrigin: true,
          rewrite: () => "/study-api/config",
        },
        "^/study-api/": {
          target: "http://127.0.0.1:8789",
          changeOrigin: true,
          rewrite: (path: string) => path.replace(/^\/study-api/, ""),
        },
        ...(studyToken.length >= 32
          ? {
              "^/study-cloud-admin/": {
                target:
                  "https://trading-copilot-study.dnyanesh-copilot.workers.dev",
                changeOrigin: true,
                rewrite: (path: string) =>
                  path.replace(/^\/study-cloud-admin/, "/study-admin"),
                headers: { Authorization: `Bearer ${studyToken}` },
              },
              "^/study-admin/": {
                target: "http://127.0.0.1:8789",
                changeOrigin: true,
                rewrite: (path: string) =>
                  path.replace(/^\/study-admin/, "/admin"),
                headers: { Authorization: `Bearer ${studyToken}` },
              },
            }
          : {}),
        "^/strategy-api/strategy$": {
          target: "http://127.0.0.1:8788",
          changeOrigin: true,
          rewrite: () => "/strategy",
        },
        ...(token.length >= 32
          ? {
              "^/internal-api/events$": {
                target: "http://127.0.0.1:8787",
                changeOrigin: true,
                rewrite: () => "/events",
                headers: { Authorization: `Bearer ${token}` },
              },
            }
          : {}),
      },
    },
  };
});

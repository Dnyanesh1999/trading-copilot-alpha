import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
export default defineConfig(({ command }) => {
  let token = "";
  if (command === "serve") {
    try {
      token =
        parseEnv(
          readFileSync(new URL("./worker/.dev.vars", import.meta.url), "utf8"),
        ).INGEST_TOKEN ?? "";
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

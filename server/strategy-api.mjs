import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

import {schema,instruction,validResult} from "./strategy-policy.mjs";

/** Dependency injection keeps verification entirely offline. No prompts, keys or provider bodies are logged. */
export function createStrategyServer({
  apiKey = "",
  model = "gemini-3.5-flash-lite",
  transport = fetch,
  timeoutMs = 30000,
} = {}) {
  let active = 0;
  let windowStart = Date.now();
  let requests = 0;
  return createServer(async (req, res) => {
    const reply = (status, errorOrResult) => {
      res.writeHead(status, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(JSON.stringify(errorOrResult));
    };
    const origin = req.headers.origin;
    if (
      (origin &&
        !["http://127.0.0.1:5173", "http://localhost:5173"].includes(origin)) ||
      req.headers["sec-fetch-site"] === "cross-site" ||
      !/^(127\.0\.0\.1|localhost):\d+$/.test(req.headers.host ?? "")
    ) {
      reply(403, { error: "Local development requests only." });
      return;
    }
    if (req.url !== "/strategy") {
      reply(404, { error: "Not found." });
      return;
    }
    if (req.method !== "POST") {
      reply(405, { error: "POST required." });
      return;
    }
    if (
      req.headers["content-type"]?.split(";")[0].trim() !== "application/json"
    ) {
      reply(415, { error: "JSON required." });
      return;
    }
    if (!apiKey) {
      reply(503, { error: "AI is not configured. Use manual rules." });
      return;
    }
    if (!/^gemini-[a-zA-Z0-9._-]+$/.test(model)) {
      reply(503, { error: "AI model configuration is invalid." });
      return;
    }
    if (Date.now() - windowStart >= 60000) {
      windowStart = Date.now();
      requests = 0;
    }
    if (active >= 2 || requests >= 12) {
      reply(429, { error: "Please wait before retrying." });
      return;
    }
    requests++;
    active++;
    const timer = setTimeout(() => req.destroy(), 10000);
    try {
      let size = 0;
      const chunks = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 32768) {
          reply(413, { error: "Strategy text is too long." });
          return;
        }
        chunks.push(chunk);
      }
      clearTimeout(timer);
      let input;
      try {
        input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        reply(400, { error: "Invalid JSON." });
        return;
      }
      if (
        !input ||
        typeof input.description !== "string" ||
        !input.description.trim() ||
        input.description.length > 6000 ||
        (input.answers !== undefined &&
          (typeof input.answers !== "string" || input.answers.length > 3000)) ||
        Object.keys(input).some(
          (key) => !["description", "answers"].includes(key),
        )
      ) {
        reply(400, {
          error: "Provide a strategy and optional short clarification.",
        });
        return;
      }
      const provider = await transport(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          signal: AbortSignal.timeout(timeoutMs),
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: instruction }] },
            contents: [
              {
                role: "user",
                parts: [
                  {
                    text: JSON.stringify({
                      description: input.description,
                      answers: input.answers ?? "",
                    }),
                  },
                ],
              },
            ],
            generationConfig: {
              temperature: 0,
              maxOutputTokens: 2048,
              responseMimeType: "application/json",
              responseJsonSchema: schema,
            },
          }),
        },
      );
      if (!provider.ok) {
        reply(provider.status === 429 ? 429 : 502, {
          error: "AI provider unavailable. Use manual rules or retry.",
        });
        return;
      }
      const text = await provider.text();
      if (text.length > 65536) throw new Error("Provider response too large");
      const payload = JSON.parse(text);
      const candidate = payload.candidates?.[0];
      if (candidate?.finishReason !== "STOP")
        throw new Error("Incomplete model response");
      const result = JSON.parse(
        candidate.content?.parts
          ?.filter((part) => !part.thought)
          .map((part) => part.text ?? "")
          .join(""),
      );
      if (!validResult(result)) throw new Error("Invalid model response");
      reply(200, {
        rules: result.rules.map(({ ruleId, value }) => ({ ruleId, value })),
        questions: result.questions,
        unsupported: result.unsupported,
        model,
      });
    } catch {
      if (!res.headersSent && !res.destroyed)
        reply(502, {
          error:
            "AI could not clarify this strategy. Your draft is safe; use manual rules or retry.",
        });
    } finally {
      clearTimeout(timer);
      active--;
    }
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    process.loadEnvFile(new URL("../.env.local", import.meta.url));
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error("Could not read local AI configuration.");
      process.exit(1);
    }
  }
  const server = createStrategyServer({
    apiKey: process.env.GEMINI_API_KEY,
    model: process.env.GEMINI_MODEL || "gemini-3.5-flash-lite",
  });
  server.requestTimeout = 45000;
  server.headersTimeout = 10000;
  server.listen(8788, "127.0.0.1", () =>
    console.log(
      "Local strategy API ready on 127.0.0.1:8788. No strategy text is logged.",
    ),
  );
}

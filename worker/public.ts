import studyWorker, { hash } from "./study";
import { accounts, hasStudyAccountAccess } from "./accounts";
import {
  schema,
  instruction,
  validResult,
} from "../server/strategy-policy.mjs";
interface Env {
  DB: D1Database;
  AUTH_DB?: D1Database;
  AUTH_SECRET?: string;
  REVIEW_ENCRYPTION_KEY?: string;
  ACCOUNT_LOGIN?: string;
  BREVO_API_KEY?: string;
  ACCOUNT_MAIL_FROM?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  ASSETS: Fetcher;
  STUDY_MODE: string;
  STUDY_ADMIN_TOKEN?: string;
  PUBLIC_ORIGIN?: string;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
}
const response = (error: string, status: number) =>
  Response.json(
    { error },
    { status, headers: { "Cache-Control": "no-store" } },
  );
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const accountResponse = await accounts(request, env);
    if (accountResponse) return accountResponse;
    if (url.pathname.startsWith("/study-api/")) {
      const bearer = (request.headers.get("Authorization") ?? "").replace(
        /^Bearer /,
        "",
      );
      if (bearer) {
        const linked = await env.DB.prepare(
          "SELECT participant_id FROM sessions WHERE token_hash=?",
        )
          .bind(await hash(bearer))
          .first<{ participant_id: string }>();
        if (
          linked &&
          !(await hasStudyAccountAccess(request, env, linked.participant_id))
        )
          return response(
            "Sign in to the account that started this review.",
            401,
          );
      }
      const internal = new URL(url);
      internal.pathname = url.pathname.replace("/study-api", "");
      return studyWorker.fetch(new Request(internal, request), env);
    }
    if (url.pathname.startsWith("/study-admin/")) {
      const internal = new URL(url);
      internal.pathname = url.pathname.replace("/study-admin", "/admin");
      return studyWorker.fetch(new Request(internal, request), env);
    }
    if (url.pathname === "/strategy-api/strategy") {
      if (
        !env.PUBLIC_ORIGIN ||
        url.origin !== env.PUBLIC_ORIGIN ||
        (request.headers.get("Origin") &&
          request.headers.get("Origin") !== env.PUBLIC_ORIGIN) ||
        request.method !== "POST"
      )
        return response("Same-origin POST required.", 403);
      const auth = (request.headers.get("Authorization") ?? "").replace(
        /^Bearer /,
        "",
      );
      if (!auth)
        return response("Sign in and start your review before using AI.", 401);
      const session = await env.DB.prepare(
        "SELECT session_id,participant_id FROM sessions WHERE token_hash=? AND status='active'",
      )
        .bind(await hash(auth))
        .first<{ session_id: string; participant_id: string }>();
      if (!session) return response("Session access required.", 401);
      if (!(await hasStudyAccountAccess(request, env, session.participant_id)))
        return response(
          "Sign in to the account that started this review.",
          401,
        );
      if (!env.GEMINI_API_KEY) return response("AI is not configured.", 503);
      const model = env.GEMINI_MODEL ?? "gemini-3.5-flash-lite";
      if (!/^gemini-[A-Za-z0-9._-]+$/.test(model))
        return response("AI configuration unavailable.", 503);
      if (
        request.headers.get("Content-Type")?.split(";")[0] !==
        "application/json"
      )
        return response("JSON required.", 415);
      let text = "";
      const reader = request.body?.getReader();
      if (!reader) return response("Body required.", 400);
      let bytes = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.length;
        if (bytes > 16384) {
          await reader.cancel();
          return response("Request too large.", 413);
        }
        text += new TextDecoder().decode(value, { stream: true });
      }
      let input;
      try {
        input = JSON.parse(text);
      } catch {
        return response("Invalid JSON.", 400);
      }
      if (
        !input ||
        typeof input.description !== "string" ||
        !input.description.trim() ||
        input.description.length > 6000 ||
        (input.answers !== undefined &&
          (typeof input.answers !== "string" || input.answers.length > 3000)) ||
        Object.keys(input).some((k) => !["description", "answers"].includes(k))
      )
        return response("Provide a strategy and optional clarification.", 400);
      const allowed = await env.DB.prepare(
        "UPDATE sessions SET ai_calls=ai_calls+1 WHERE session_id=? AND ai_calls<20 AND status='active' RETURNING session_id",
      )
        .bind(session.session_id)
        .first();
      if (!allowed)
        return response("Session AI allowance reached. Use manual rules.", 429);
      try {
        const provider = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": env.GEMINI_API_KEY,
            },
            signal: AbortSignal.timeout(30000),
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
        if (!provider.ok)
          return response(
            "AI provider unavailable. Retry or use manual rules.",
            provider.status === 429 ? 429 : 502,
          );
        const raw = await provider.text();
        if (raw.length > 65536) throw new Error();
        const payload = JSON.parse(raw),
          candidate = payload.candidates?.[0];
        if (candidate?.finishReason !== "STOP") throw new Error();
        const result = JSON.parse(
          candidate.content.parts
            .filter((p: { thought?: boolean }) => !p.thought)
            .map((p: { text?: string }) => p.text ?? "")
            .join(""),
        );
        if (!validResult(result)) throw new Error();
        return Response.json(
          {
            rules: result.rules.map(
              (r: { ruleId: string; value: unknown }) => ({
                ruleId: r.ruleId,
                value: r.value,
              }),
            ),
            questions: result.questions,
            unsupported: result.unsupported,
            model,
          },
          { headers: { "Cache-Control": "no-store" } },
        );
      } catch {
        return response(
          "AI could not clarify this strategy. Retry or use manual rules.",
          502,
        );
      }
    }
    const path = url.pathname.startsWith("/trading-copilot-alpha/")
      ? url.pathname.replace("/trading-copilot-alpha", "")
      : url.pathname;
    if (path === "/" && !url.search) {
      url.search = "?study=1";
      return Response.redirect(url.toString(), 302);
    }
    url.pathname = path;
    return env.ASSETS.fetch(new Request(url, request));
  },
};

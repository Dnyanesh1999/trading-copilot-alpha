import { createAuth, type AccountEnv } from "./auth";
import studyWorker, { hash } from "./study";
import { CONSENT_VERSION } from "../src/study/protocol";
interface Env extends Partial<AccountEnv> {
  DB: D1Database;
  STUDY_MODE: string;
  STUDY_ADMIN_TOKEN?: string;
  ACCOUNT_LOGIN?: string;
  ETHICS_APPROVED?: string;
  APPROVED_INFO_VERSION?: string;
  APPROVED_INFO_TEXT?: string;
}
const reply = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
export const ready = (env: Env): env is Env & AccountEnv =>
  !!env.AUTH_DB && !!env.AUTH_SECRET && !!env.PUBLIC_ORIGIN;
export async function accounts(
  request: Request,
  env: Env,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (
    !["/api/auth/", "/account-api/"].some((p) => url.pathname.startsWith(p)) &&
    url.pathname !== "/study-admin/accounts"
  )
    return null;
  if (request.method === "POST") {
    const reader = request.body?.getReader();
    if (!reader) return reply({ error: "Request body required." }, 400);
    const parts: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 32768) {
        await reader.cancel();
        return reply({ error: "Request too large." }, 413);
      }
      parts.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const part of parts) {
      bytes.set(part, offset);
      offset += part.length;
    }
    request = new Request(request, { body: bytes });
  }
  if (!ready(env))
    return reply({ error: "Account sign-in is not available yet." }, 503);
  try {
    const auth = createAuth(env);
    if (url.pathname.startsWith("/api/auth/"))
      return await auth.handler(request);
    if (url.pathname === "/study-admin/accounts") {
      if (request.method !== "GET")
        return reply({ error: "Method not allowed." }, 405);
      const key = (request.headers.get("Authorization") ?? "").replace(
        /^Bearer /,
        "",
      );
      if (
        !env.STUDY_ADMIN_TOKEN ||
        (await hash(key)) !== (await hash(env.STUDY_ADMIN_TOKEN))
      )
        return reply({ error: "Researcher access required." }, 401);
      const result = await env.AUTH_DB.prepare(
        "SELECT l.id,l.mode,u.name FROM auth_study_link l JOIN auth_user u ON u.id=l.user_id ORDER BY l.id",
      ).all<{ id: number; mode: string; name: string }>();
      return reply({
        accounts: result.results.map((r) => ({
          participantId:
            (r.mode === "participant" ? "T" : "R") +
            String(r.id).padStart(4, "0"),
          name: r.name,
        })),
      });
    }
    const session = await auth.api.getSession({ headers: request.headers });
    if (url.pathname === "/account-api/me" && request.method === "GET") {
      if (!session) return reply({ user: null });
      const profile = await env.AUTH_DB.prepare(
        "SELECT trading_style,experience,device FROM auth_profile WHERE user_id=?",
      )
        .bind(session.user.id)
        .first();
      return reply({
        user: {
          id: session.user.id,
          name: session.user.name,
          email: session.user.email,
        },
        profile,
      });
    }
    if (!session) return reply({ error: "Please sign in to continue." }, 401);
    if (
      url.pathname === "/account-api/start-review" &&
      request.method === "POST"
    ) {
      if (request.headers.get("Origin") !== env.PUBLIC_ORIGIN)
        return reply({ error: "Origin denied." }, 403);
      if (
        request.headers.get("Content-Type")?.split(";")[0] !==
        "application/json"
      )
        return reply({ error: "JSON required." }, 415);
      const text = await request.text();
      if (text.length > 4096)
        return reply({ error: "Request too large." }, 413);
      const body = JSON.parse(text);
      const keys = [
        "consent",
        "consentVersion",
        "device",
        "experience",
        "tradingStyle",
      ];
      if (
        !body ||
        Object.keys(body).sort().join(",") !== keys.join(",") ||
        body.consent !== true ||
        !["intraday", "swing", "other"].includes(body.tradingStyle) ||
        !["under 1 year", "1-3 years", "over 3 years"].includes(
          body.experience,
        ) ||
        !["mobile", "desktop"].includes(body.device)
      )
        return reply(
          {
            error:
              "Complete your profile and agree to the information before starting.",
          },
          400,
        );
      const mode = env.STUDY_MODE;
      if (
        mode !== "rehearsal" &&
        !(
          mode === "participant" &&
          env.ETHICS_APPROVED === "yes" &&
          env.APPROVED_INFO_VERSION &&
          env.APPROVED_INFO_TEXT
        )
      )
        return reply({ error: "Study sessions are not enabled." }, 403);
      const version =
        mode === "participant" ? env.APPROVED_INFO_VERSION : CONSENT_VERSION;
      if (body.consentVersion !== version)
        return reply(
          { error: "Read and agree to the current participant information." },
          400,
        );
      await env.AUTH_DB.prepare(
        "INSERT INTO auth_study_link(user_id,mode) VALUES(?,?) ON CONFLICT(user_id,mode) DO NOTHING",
      )
        .bind(session.user.id, mode)
        .run();
      const link = await env.AUTH_DB.prepare(
        "SELECT id FROM auth_study_link WHERE user_id=? AND mode=?",
      )
        .bind(session.user.id, mode)
        .first<{ id: number }>();
      if (!link) throw Error("Link unavailable");
      const label =
        (mode === "participant" ? "T" : "R") + String(link.id).padStart(4, "0");
      const internal = new URL("/sessions", url);
      const result = await studyWorker.fetch(
        new Request(internal, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, accessCode: "" }),
        }),
        { ...env, ACCOUNT_PARTICIPANT: label },
      );
      const data = (await result.json()) as Record<string, unknown>;
      if (!result.ok) return reply(data, result.status);
      await env.AUTH_DB.prepare(
        "INSERT INTO auth_profile(user_id,trading_style,experience,device) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET trading_style=excluded.trading_style,experience=excluded.experience,device=excluded.device",
      )
        .bind(session.user.id, body.tradingStyle, body.experience, body.device)
        .run();
      return reply({ ...data, displayName: session.user.name });
    }
    return reply({ error: "Not found." }, 404);
  } catch {
    return reply(
      {
        error: "Account service could not complete this request. Please retry.",
      },
      500,
    );
  }
}

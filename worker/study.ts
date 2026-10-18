import {
  CONSENT_VERSION,
  STUDY_BUILD,
  taskIds,
  ratingIds,
  isRecord,
  validateFinish,
  validateStudyEvent,
  type StudyEvent,
} from "../src/study/protocol";
interface Env {
  DB: D1Database;
  STUDY_MODE: string;
  STUDY_ADMIN_TOKEN?: string;
  PUBLIC_ORIGIN?: string;
  ETHICS_APPROVED?: string;
  APPROVED_INFO_VERSION?: string;
  APPROVED_INFO_TEXT?: string;
}
const respond = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
export const hash = async (s: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)),
    ),
  )
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
const token = () => crypto.randomUUID() + crypto.randomUUID();
async function json(request: Request): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json")
    throw new Error("json_required");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("invalid_body");
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.length;
    if (bytes > 32768) {
      await reader.cancel();
      throw new Error("too_large");
    }
    chunks.push(value);
  }
  const all = new Uint8Array(bytes);
  let offset = 0;
  for (const c of chunks) {
    all.set(c, offset);
    offset += c.length;
  }
  return JSON.parse(new TextDecoder().decode(all));
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const participantMode =
      env.STUDY_MODE === "participant" &&
      env.ETHICS_APPROVED === "yes" &&
      !!env.APPROVED_INFO_VERSION &&
      !!env.APPROVED_INFO_TEXT;
    const consentVersion = participantMode
      ? env.APPROVED_INFO_VERSION!
      : CONSENT_VERSION;
    // Real collection requires explicit approval plus the final participant-information version.
    if (
      (env.STUDY_MODE !== "rehearsal" && !participantMode) ||
      (!["localhost", "127.0.0.1"].includes(url.hostname) &&
        env.PUBLIC_ORIGIN !== url.origin)
    )
      return respond(
        { error: "Study collection is not enabled for external participants." },
        403,
      );
    const origin = request.headers.get("Origin");
    if (
      origin &&
      ![
        "http://127.0.0.1:5173",
        "http://localhost:5173",
        env.PUBLIC_ORIGIN,
      ].includes(origin)
    )
      return respond({ error: "Origin denied." }, 403);
    const auth = (request.headers.get("Authorization") ?? "").replace(
      /^Bearer /,
      "",
    );
    try {
      if (url.pathname === "/config" && request.method === "GET")
        return respond({
          mode: participantMode ? "participant" : "rehearsal",
          consentVersion,
          information: participantMode ? env.APPROVED_INFO_TEXT : null,
          build: STUDY_BUILD,
        });
      if (url.pathname.startsWith("/admin/")) {
        if (
          !env.STUDY_ADMIN_TOKEN ||
          env.STUDY_ADMIN_TOKEN.length < 32 ||
          (await hash(auth)) !== (await hash(env.STUDY_ADMIN_TOKEN))
        )
          return respond({ error: "Researcher access required." }, 401);
        if (url.pathname === "/admin/invites" && request.method === "POST") {
          const body = await json(request);
          if (
            !isRecord(body) ||
            Object.keys(body).join(",") !== "participantId" ||
            !(participantMode ? /^T\d{2}$/ : /^DEMO\d{2}$/).test(
              String(body.participantId),
            )
          )
            return respond(
              {
                error:
                  "Use a rehearsal label such as DEMO01. Real trader codes are disabled.",
              },
              400,
            );
          const code = token();
          await env.DB.prepare(
            "INSERT INTO study_invites(code_hash,participant_id,created_at) VALUES(?,?,?)",
          )
            .bind(
              await hash(code),
              body.participantId,
              new Date().toISOString(),
            )
            .run();
          return respond({
            participantId: body.participantId,
            accessCode: code,
          });
        }
        if (url.pathname === "/admin/export" && request.method === "GET") {
          const statements = [
            "SELECT * FROM participants ORDER BY participant_id",
            "SELECT session_id,participant_id,mode,consent_version,consented_at,app_version,started_at,ended_at,status FROM sessions ORDER BY started_at",
            "SELECT * FROM tasks ORDER BY session_id,task_id",
            "SELECT * FROM ratings ORDER BY session_id,item_id",
            "SELECT * FROM comments ORDER BY session_id,comment_id",
            "SELECT event_id,session_id,sequence,payload,received_at FROM usage_events ORDER BY session_id,sequence",
            "SELECT participant_id,created_at FROM study_invites ORDER BY participant_id",
          ];
          const result = await env.DB.batch(
            statements.map((s) => env.DB.prepare(s)),
          );
          return respond(
            Object.fromEntries(
              [
                "participants",
                "sessions",
                "tasks",
                "ratings",
                "comments",
                "events",
                "invites",
              ].map((key, i) => [key, result[i].results]),
            ),
          );
        }
        return respond({ error: "Not found." }, 404);
      }
      if (url.pathname === "/sessions" && request.method === "POST") {
        const body = await json(request);
        if (
          !isRecord(body) ||
          Object.keys(body).sort().join(",") !==
            "accessCode,consent,consentVersion,device,experience,tradingStyle" ||
          body.consent !== true ||
          body.consentVersion !== consentVersion ||
          typeof body.accessCode !== "string" ||
          body.accessCode.length > 100 ||
          !["intraday", "swing", "other"].includes(String(body.tradingStyle)) ||
          !["under 1 year", "1-3 years", "over 3 years"].includes(
            String(body.experience),
          ) ||
          !["mobile", "desktop"].includes(String(body.device))
        )
          return respond(
            {
              error:
                "Complete the profile and agree to the current information before starting.",
            },
            400,
          );
        const invite = await env.DB.prepare(
          "SELECT participant_id FROM study_invites WHERE code_hash=?",
        )
          .bind(await hash(body.accessCode))
          .first<{ participant_id: string }>();
        if (!invite)
          return respond(
            {
              error:
                "That access code is not recognised. Ask the researcher for your code.",
            },
            401,
          );
        const sessionId = crypto.randomUUID(),
          sessionToken = token(),
          now = new Date().toISOString();
        await env.DB.batch([
          env.DB.prepare(
            "INSERT INTO participants(participant_id,trading_style,experience,device,session_date) VALUES(?,?,?,?,?) ON CONFLICT(participant_id) DO NOTHING",
          ).bind(
            invite.participant_id,
            body.tradingStyle,
            body.experience,
            body.device,
            now.slice(0, 10),
          ),
          env.DB.prepare(
            "INSERT INTO sessions(session_id,participant_id,token_hash,mode,consent_version,consented_at,app_version,started_at,status) VALUES(?,?,?,?,?,?,?,?,?)",
          ).bind(
            sessionId,
            invite.participant_id,
            await hash(sessionToken),
            participantMode ? "participant" : "rehearsal",
            consentVersion,
            now,
            STUDY_BUILD,
            now,
            "active",
          ),
        ]);
        return respond({
          sessionId,
          participantId: invite.participant_id,
          sessionToken,
          mode: participantMode ? "participant" : "rehearsal",
        });
      }
      if (!auth) return respond({ error: "Session access required." }, 401);
      const session = await env.DB.prepare(
        "SELECT session_id,participant_id,status,finish_hash FROM sessions WHERE token_hash=?",
      )
        .bind(await hash(auth))
        .first<{
          session_id: string;
          participant_id: string;
          status: string;
          finish_hash: string | null;
        }>();
      if (!session) return respond({ error: "Session not recognised." }, 401);
      if (url.pathname === "/session" && request.method === "GET")
        return respond({
          sessionId: session.session_id,
          participantId: session.participant_id,
          status: session.status,
        });
      if (
        session.status !== "active" &&
        !(
          session.status === "finished" &&
          url.pathname === "/finish" &&
          request.method === "POST"
        )
      )
        return respond(
          { error: "This session has ended. Start a new session to continue." },
          409,
        );
      if (url.pathname === "/events" && request.method === "POST") {
        const body = await json(request);
        if (
          !isRecord(body) ||
          Object.keys(body).join(",") !== "events" ||
          !Array.isArray(body.events) ||
          !body.events.length ||
          body.events.length > 50
        )
          return respond({ error: "Invalid event batch." }, 400);
        const events = body.events.map(validateStudyEvent);
        if (events.some((e) => !e))
          return respond(
            {
              error:
                "Unexpected event fields. No raw strategy or trade data is accepted.",
            },
            400,
          );
        const now = new Date().toISOString();
        await env.DB.batch(
          (events as StudyEvent[]).map((e) =>
            env.DB.prepare(
              "INSERT INTO usage_events(event_id,session_id,sequence,payload,received_at) VALUES(?,?,?,?,?) ON CONFLICT(event_id) DO NOTHING",
            ).bind(
              e.eventId,
              session.session_id,
              e.sequence,
              JSON.stringify(e),
              now,
            ),
          ),
        );
        return respond({ acceptedEventIds: events.map((e) => e!.eventId) });
      }
      if (url.pathname === "/finish" && request.method === "POST") {
        const data = await json(request);
        if (!validateFinish(data))
          return respond(
            {
              error:
                "Check questionnaire responses and remove identifying details from the comment.",
            },
            400,
          );
        const receipt = await hash(
          JSON.stringify({
            ratings: ratingIds.map((id) => data.ratings[id]),
            assessments: taskIds.map((id) =>
              data.assessments.find((a) => a.taskId === id),
            ),
            comment: data.comment.trim(),
            theme: data.theme,
          }),
        );
        if (session.status === "finished")
          return session.finish_hash === receipt
            ? respond({ saved: true })
            : respond(
                {
                  error: "This session already has different saved responses.",
                },
                409,
              );
        const stored = await env.DB.prepare(
          "SELECT payload FROM usage_events WHERE session_id=? ORDER BY sequence",
        )
          .bind(session.session_id)
          .all<{ payload: string }>();
        const events = stored.results.map(
          (r) => JSON.parse(r.payload) as StudyEvent,
        );
        const statements: D1PreparedStatement[] = [];
        for (const id of taskIds) {
          const relevant = events.filter((e) => e.taskId === id),
            durations = relevant.filter((e) => e.type === "visible_interval"),
            assessment = data.assessments.find((a) => a.taskId === id)!;
          statements.push(
            env.DB.prepare(
              "INSERT INTO tasks(session_id,participant_id,task_id,completed,time_seconds,needed_help,evidence_opened,notes,measurement_source) VALUES(?,?,?,?,?,?,?,?,?)",
            ).bind(
              session.session_id,
              session.participant_id,
              id,
              assessment.completed,
              durations.length
                ? Math.round(
                    durations.reduce((s, e) => s + (e.durationMs ?? 0), 0) /
                      100,
                  ) / 10
                : null,
              assessment.neededHelp,
              relevant.some((e) => e.type === "evidence_opened") ? "yes" : "no",
              "Completion and help reported by user; corroborating app markers retained in events.",
              "app-visible-time + self-report",
            ),
          );
        }
        for (const id of ratingIds)
          statements.push(
            env.DB.prepare(
              "INSERT INTO ratings(session_id,participant_id,item_id,score,response_status) VALUES(?,?,?,?,?)",
            ).bind(
              session.session_id,
              session.participant_id,
              id,
              data.ratings[id],
              data.ratings[id] === null ? "skipped" : "answered",
            ),
          );
        if (data.comment.trim())
          statements.push(
            env.DB.prepare(
              "INSERT INTO comments(comment_id,session_id,participant_id,source,theme,quote,redaction_status) VALUES(?,?,?,?,?,?,?)",
            ).bind(
              crypto.randomUUID(),
              session.session_id,
              session.participant_id,
              "in-app feedback",
              data.theme,
              data.comment.trim(),
              "researcher review required",
            ),
          );
        statements.push(
          env.DB.prepare(
            "UPDATE sessions SET status='finished',ended_at=?,finish_hash=? WHERE session_id=? AND status='active'",
          ).bind(new Date().toISOString(), receipt, session.session_id),
        );
        await env.DB.batch(statements);
        return respond({ saved: true });
      }
      if (url.pathname === "/stop" && request.method === "POST") {
        await env.DB.prepare(
          "UPDATE sessions SET status='stopped',ended_at=? WHERE session_id=? AND status='active'",
        )
          .bind(new Date().toISOString(), session.session_id)
          .run();
        return respond({ stopped: true });
      }
      return respond({ error: "Not found." }, 404);
    } catch (error) {
      const m = error instanceof Error ? error.message : "";
      return respond(
        {
          error: /conflict|UNIQUE constraint/.test(m)
            ? "Duplicate or conflicting record. Check before retrying."
            : m === "too_large"
              ? "Request too large."
              : m === "json_required"
                ? "JSON required."
                : m.includes("JSON") || m === "invalid_body"
                  ? "Invalid request."
                  : "Storage unavailable. Your session is not marked finished; retry when connected.",
        },
        /conflict|UNIQUE constraint/.test(m)
          ? 409
          : m === "too_large"
            ? 413
            : m === "json_required"
              ? 415
              : m.includes("JSON") || m === "invalid_body"
                ? 400
                : 503,
      );
    }
  },
};

import { MAX_BODY_BYTES, validateBatch } from "../src/core/journey-schema";
interface Env {
  DB: D1Database;
  COLLECTION_MODE: string;
  INGEST_TOKEN?: string;
  EXPORT_TOKEN?: string;
}
function reply(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
async function authorised(request: Request, token?: string) {
  if (!token || token.length < 32) return false;
  const supplied = request.headers.get("Authorization") ?? "";
  const encode = (value: string) =>
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  const [a, b] = await Promise.all([
    encode(supplied),
    encode(`Bearer ${token}`),
  ]);
  const left = new Uint8Array(a),
    right = new Uint8Array(b);
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left[i] ^ right[i];
  return difference === 0;
}
async function boundedJSON(request: Request) {
  if (!request.body) throw new Error("invalid_body");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new Error("too_large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
function integer(value: string | null, fallback: number) {
  if (value === null) return fallback;
  return /^\d+$/.test(value) && Number.isSafeInteger(Number(value))
    ? Number(value)
    : -1;
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    // Intentionally not a deployable public collector. A remote rollout needs its own reviewed config.
    if (
      env.COLLECTION_MODE !== "local-internal" ||
      !["127.0.0.1", "localhost"].includes(url.hostname)
    )
      return reply({ error: "collection_disabled" }, 403);
    const origin = request.headers.get("Origin");
    if (
      origin &&
      !["http://127.0.0.1:5173", "http://localhost:5173"].includes(origin)
    )
      return reply({ error: "origin_denied" }, 403);
    if (url.pathname === "/events" && request.method === "POST") {
      if (!(await authorised(request, env.INGEST_TOKEN)))
        return reply({ error: "unauthorised" }, 401);
      if (
        request.headers.get("Content-Type")?.split(";")[0].trim() !==
        "application/json"
      )
        return reply({ error: "json_required" }, 415);
      let body: unknown;
      try {
        body = await boundedJSON(request);
      } catch (error) {
        return reply(
          { error: "invalid_body" },
          error instanceof Error && error.message === "too_large" ? 413 : 400,
        );
      }
      const events = validateBatch(body);
      if (!events) return reply({ error: "invalid_events" }, 400);
      const receivedAt = new Date().toISOString();
      try {
        await env.DB.batch(
          events.map((event) =>
            env.DB.prepare(
              "INSERT INTO journey_events(event_id, session_id, sequence, payload, received_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(event_id) DO NOTHING",
            ).bind(
              event.eventId,
              event.sessionId,
              event.sequence,
              JSON.stringify(event),
              receivedAt,
            ),
          ),
        );
      } catch (error) {
        const conflict =
          error instanceof Error &&
          /event_id_conflict|UNIQUE constraint failed/.test(error.message);
        return reply(
          { error: conflict ? "event_conflict" : "storage_unavailable" },
          conflict ? 409 : 503,
        );
      }
      return reply({
        acceptedEventIds: [...new Set(events.map((e) => e.eventId))],
      });
    }
    if (url.pathname === "/export" && request.method === "GET") {
      if (!(await authorised(request, env.EXPORT_TOKEN)))
        return reply({ error: "unauthorised" }, 401);
      const after = integer(url.searchParams.get("after"), 0);
      const limit = integer(url.searchParams.get("limit"), 100);
      let until = integer(url.searchParams.get("until"), 0);
      if (
        after < 0 ||
        limit < 1 ||
        limit > 100 ||
        until < 0 ||
        (after > 0 && !url.searchParams.has("until")) ||
        [...url.searchParams.keys()].some(
          (k) => !["after", "until", "limit"].includes(k),
        )
      )
        return reply({ error: "invalid_cursor" }, 400);
      try {
        if (!url.searchParams.has("until"))
          until =
            (await env.DB.prepare(
              "SELECT COALESCE(MAX(ordinal), 0) AS last FROM journey_events",
            ).first<number>("last")) ?? 0;
        const { results } = await env.DB.prepare(
          "SELECT ordinal, payload, received_at FROM journey_events WHERE ordinal > ? AND ordinal <= ? ORDER BY ordinal LIMIT ?",
        )
          .bind(after, until, limit + 1)
          .all<{ ordinal: number; payload: string; received_at: string }>();
        const page = results.slice(0, limit);
        return reply({
          schemaVersion: 1,
          mode: "internal",
          until,
          nextCursor:
            results.length > limit ? page[page.length - 1].ordinal : null,
          records: page.map((row) => ({
            ordinal: row.ordinal,
            receivedAt: row.received_at,
            event: JSON.parse(row.payload),
          })),
        });
      } catch {
        return reply({ error: "storage_unavailable" }, 503);
      }
    }
    return reply({ error: "not_found" }, 404);
  },
};

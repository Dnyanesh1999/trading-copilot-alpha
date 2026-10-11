// Integration checks against the running local Worker and real local D1.
// Adds only synthetic internal records; never clears the existing database.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { parseEnv } from "node:util";
const env = parseEnv(
  readFileSync(new URL("../worker/.dev.vars", import.meta.url), "utf8"),
);
const url = "http://127.0.0.1:8787";
const sessionId = randomUUID();
const checks = [];
const event = (sequence, type = "stage_entered") => ({
  version: 1,
  build: "internal-journey-v1",
  mode: "internal",
  eventId: randomUUID(),
  sessionId,
  sequence,
  at: new Date().toISOString(),
  type,
  stage: "rules",
});
const post = (events, token = env.INGEST_TOKEN, extraHeaders = {}) =>
  fetch(`${url}/events`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...extraHeaders,
    },
    body: JSON.stringify({ events }),
    signal: AbortSignal.timeout(10000),
  });
const exp = (query = "", token = env.EXPORT_TOKEN) =>
  fetch(`${url}/export${query}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10000),
  });
async function expectStatus(response, expected, name) {
  assert.equal(response.status, expected, `${name}: ${await response.text()}`);
  checks.push(name);
}
await expectStatus(await post([event(1)], ""), 401, "ingest requires token");
await expectStatus(
  await exp("", env.INGEST_TOKEN),
  401,
  "write token cannot export",
);
await expectStatus(
  await post([event(1)], env.EXPORT_TOKEN),
  401,
  "read token cannot ingest",
);
await expectStatus(await exp("", ""), 401, "export requires token");
await expectStatus(
  await post([event(1)], env.INGEST_TOKEN, {
    Origin: "https://untrusted.invalid",
  }),
  403,
  "cross-origin collection rejected",
);
const start = event(1, "session_started"),
  confirmed = event(2, "rules_confirmed");
await expectStatus(
  await post([start, confirmed]),
  200,
  "valid internal batch stored",
);
await expectStatus(
  await post([start, confirmed]),
  200,
  "identical retry acknowledged",
);
await expectStatus(
  await post([{ ...start, type: "reset" }]),
  409,
  "conflicting event ID rejected",
);
await expectStatus(
  await post([event(2)]),
  409,
  "conflicting session sequence rejected",
);
await expectStatus(
  await post([{ ...event(3), strategy: "must not be stored" }]),
  400,
  "extra text rejected",
);
await expectStatus(
  await post([{ ...event(3), mode: "participant" }]),
  400,
  "participant mode rejected",
);
await expectStatus(
  await post([{ ...event(3), sequence: -1 }]),
  400,
  "invalid sequence rejected",
);
await expectStatus(
  await post(Array.from({ length: 51 }, (_, i) => event(i + 3))),
  400,
  "oversized batch rejected",
);
await expectStatus(
  await fetch(`${url}/events`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.INGEST_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: " ".repeat(33000),
  }),
  413,
  "oversized body rejected",
);
await expectStatus(
  await fetch(`${url}/events`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.INGEST_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: "{",
  }),
  400,
  "malformed JSON rejected",
);
await expectStatus(
  await post([event(3)], env.INGEST_TOKEN, { "Content-Type": "text/plain" }),
  415,
  "non-JSON body rejected",
);
const rolledBack = event(3);
await expectStatus(
  await post([rolledBack, { ...start, type: "reset" }]),
  409,
  "batch conflict aborts transaction",
);
await expectStatus(
  await exp("?after=1"),
  400,
  "continuation requires snapshot boundary",
);
// Freeze a paginated export, then add a record. The new record must not leak into that snapshot.
const firstResponse = await exp("?limit=1");
assert.equal(firstResponse.status, 200);
assert.equal(firstResponse.headers.get("Cache-Control"), "no-store");
const first = await firstResponse.json();
const later = event(4);
await expectStatus(await post([later]), 200, "later record stored");
const records = [...first.records];
let cursor = first.nextCursor;
while (cursor !== null) {
  const page = await (
    await exp(`?after=${cursor}&until=${first.until}&limit=1`)
  ).json();
  records.push(...page.records);
  cursor = page.nextCursor;
}
assert.equal(
  records.filter((r) => r.event.eventId === start.eventId).length,
  1,
);
assert.equal(
  records.filter((r) => r.event.eventId === confirmed.eventId).length,
  1,
);
assert.equal(
  records.some((r) => r.event.eventId === later.eventId),
  false,
);
assert.equal(
  records.some((r) => r.event.eventId === rolledBack.eventId),
  false,
);
checks.push(
  "deduplication verified in D1 export",
  "failed transaction leaves no partial insert",
  "pagination snapshot excludes later inserts",
);
assert.equal(
  records.some((r) => Object.hasOwn(r.event, "strategy")),
  false,
);
checks.push("rejected text absent from export");
// Simultaneous duplicate retries must also result in one row.
const parallel = event(5);
const retries = await Promise.all([post([parallel]), post([parallel])]);
assert.ok(retries.every((r) => r.status === 200));
const all = [];
let after = 0,
  until;
do {
  const page = await (
    await exp(`?after=${after}${until === undefined ? "" : `&until=${until}`}`)
  ).json();
  all.push(...page.records);
  until = page.until;
  after = page.nextCursor;
} while (after !== null);
assert.equal(all.filter((r) => r.event.eventId === parallel.eventId).length, 1);
checks.push("concurrent duplicate retries store one row");
const dir = new URL("../private/logging/", import.meta.url);
mkdirSync(dir, { recursive: true });
writeFileSync(
  new URL("integration-check.json", dir),
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      mode: "internal",
      sessionId,
      checks,
    },
    null,
    2,
  ),
  { mode: 0o600 },
);
console.log(
  `${checks.length} local Worker/D1 integration checks passed. Synthetic session only; evidence saved under private/logging/.`,
);

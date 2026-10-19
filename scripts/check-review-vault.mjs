// Account-private vault checks with fictional records only. No mail is sent.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
const root = "https://trading-copilot-study.dnyanesh-copilot.workers.dev";
const admin = parseEnv(
  readFileSync(new URL("../worker/.dev.vars", import.meta.url), "utf8"),
).STUDY_ADMIN_TOKEN;
const config = await (
  await fetch(root + "/study-api/config", {
    signal: AbortSignal.timeout(15000),
  })
).json();
assert.equal(
  config.mode,
  "rehearsal",
  "Synthetic checks require rehearsal mode",
);
assert(
  !config.emailRecovery,
  "Stop: live mail delivery is enabled. Synthetic .invalid signup tests must not send real mail.",
);
let checks = 0;
async function call(
  path,
  body,
  cookie = "",
  method = body === undefined ? "GET" : "POST",
  headers = {},
) {
  return fetch(root + path, {
    method,
    headers: {
      Origin: root,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(cookie ? { Cookie: cookie } : {}),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(25000),
  });
}
async function status(response, expected) {
  assert.equal(
    response.status,
    expected,
    `Unexpected status ${response.status}; wanted ${expected}`,
  );
  checks++;
  return response;
}
const cookies = (r) =>
  r.headers
    .getSetCookie()
    .filter((c) => c.startsWith("__Secure-better-auth.session_token="))
    .map((c) => c.split(";")[0])
    .join("; ");
await status(await call("/account-api/reviews"), 401);
const a = {
  name: "Fictional Vault A",
  email: "vault-" + randomUUID() + "@example.invalid",
  password: randomUUID() + randomUUID(),
};
const b = {
  name: "Fictional Vault B",
  email: "vault-" + randomUUID() + "@example.invalid",
  password: randomUUID() + randomUUID(),
};
const cookieA = cookies(
  await status(await call("/api/auth/sign-up/email", a), 200),
);
const cookieB = cookies(
  await status(await call("/api/auth/sign-up/email", b), 200),
);
const id = randomUUID();
const entry = {
  id,
  name: "Private Vault QA " + id,
  savedAt: new Date().toISOString(),
  source: "sample",
  strategyName: "Fictional risk controls",
  focus: "planned-risk",
  review: {
    rules: {
      id: "rules-qa",
      maxPositions: 3,
      cutoff: "11:00",
      timezone: "Asia/Kolkata",
      confirmedAt: new Date().toISOString(),
      comparison: "hypothetical",
      enabledRules: ["planned-risk", "reward-risk", "stop-before-entry"],
      checks: { stopBeforeEntry: true, maxRisk: 500, minRewardRisk: 2 },
    },
    session: {
      id: "session-qa",
      date: "2026-10-19",
      dataSource: "fictional",
      recordsComplete: true,
      positions: [
        {
          id: "p1",
          instrument: "VAULT-QA",
          direction: "long",
          firstEntryCovered: true,
          allEntriesCovered: true,
          executionsComplete: true,
          stop: {
            id: "s1",
            price: 95,
            recordedAt: "2026-10-19T09:20:00+05:30",
          },
          target: {
            id: "t1",
            price: 110,
            recordedAt: "2026-10-19T09:20:00+05:30",
          },
          executions: [
            {
              id: "e1",
              side: "entry",
              timestamp: "2026-10-19T09:25:00+05:30",
              quantity: 10,
              price: 100,
            },
            {
              id: "e2",
              side: "exit",
              timestamp: "2026-10-19T10:00:00+05:30",
              quantity: 10,
              price: 120,
            },
          ],
        },
      ],
    },
    findings: [],
  },
};
const body = { entry, disclosureVersion: "account-review-v1" };
await status(await call("/account-api/reviews", { entry }, cookieA), 400);
await status(
  await call("/account-api/reviews", body, cookieA, "POST", {
    Origin: "https://untrusted.invalid",
  }),
  403,
);
await status(
  await call(
    "/account-api/reviews",
    { ...body, entry: { ...entry, review: null } },
    cookieA,
  ),
  400,
);
await status(
  await call(
    "/account-api/reviews",
    { oversized: "x".repeat(270000) },
    cookieA,
  ),
  413,
);
await status(await call("/account-api/reviews", body, cookieA), 200);
let saved = await (
  await status(await call("/account-api/reviews", undefined, cookieA), 200)
).json();
assert(
  saved.entries.some(
    (e) =>
      e.id === id && e.focus === entry.focus && e.review.findings.length === 3,
  ),
);
checks++;
assert(
  !(
    await (await call("/account-api/reviews", undefined, cookieB)).json()
  ).entries.some((e) => e.id === id),
);
checks++;
await status(
  await call("/account-api/reviews", { id }, cookieB, "DELETE"),
  200,
);
assert(
  (
    await (await call("/account-api/reviews", undefined, cookieA)).json()
  ).entries.some((e) => e.id === id),
);
checks++;
await status(
  await call(
    "/account-api/reviews",
    { ...body, entry: { ...entry, focus: "reward-risk" } },
    cookieA,
  ),
  200,
);
saved = await (await call("/account-api/reviews", undefined, cookieA)).json();
assert.equal(saved.entries.filter((e) => e.id === id).length, 1);
assert.equal(saved.entries.find((e) => e.id === id).focus, "reward-risk");
checks += 2;
const freshCookie = cookies(
  await status(
    await call("/api/auth/sign-in/email", {
      email: a.email,
      password: a.password,
    }),
    200,
  ),
);
assert(
  (
    await (await call("/account-api/reviews", undefined, freshCookie)).json()
  ).entries.some((e) => e.id === id),
);
checks++;
const exported = JSON.stringify(
  await (
    await status(
      await call("/study-admin/export", undefined, "", "GET", {
        Authorization: "Bearer " + admin,
      }),
      200,
    )
  ).json(),
);
assert(!exported.includes(entry.name));
assert(!exported.includes("VAULT-QA"));
assert(!exported.includes(a.email));
checks += 3;
await status(
  await call("/account-api/reviews", { id }, cookieA, "DELETE", {
    Origin: "https://untrusted.invalid",
  }),
  403,
);
await status(
  await call("/account-api/reviews", { id }, cookieA, "DELETE"),
  200,
);
assert(
  !(
    await (await call("/account-api/reviews", undefined, freshCookie)).json()
  ).entries.some((e) => e.id === id),
);
checks++;
await status(await call("/api/auth/sign-out", {}, cookieA), 200);
await status(await call("/account-api/reviews", undefined, cookieA), 401);
await call("/api/auth/sign-out", {}, cookieB);
await call("/api/auth/sign-out", {}, freshCookie);
console.log(
  `${checks} live private-review checks passed. Account isolation, separate sign-in restore, overwrite, removal and study-export exclusion verified. Synthetic records only.`,
);

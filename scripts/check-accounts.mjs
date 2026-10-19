// Synthetic account checks only. No participant identities or credentials printed.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
const root = "https://trading-copilot-study.dnyanesh-copilot.workers.dev";
const admin = parseEnv(
  readFileSync(new URL("../worker/.dev.vars", import.meta.url), "utf8"),
).STUDY_ADMIN_TOKEN;
let count = 0;
async function call(path, body, cookie = "", extra = {}) {
  return fetch(root + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Origin: root,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(cookie ? { Cookie: cookie } : {}),
      ...extra,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(25000),
  });
}
async function status(r, n) {
  assert.equal(r.status, n, `Unexpected HTTP ${r.status}; expected ${n}`);
  count++;
  return r;
}
const adminHeaders = { Authorization: "Bearer " + admin };
await status(await call("/study-admin/accounts"), 401);
await status(await call("/account-api/start-review", {}), 401);
assert.equal((await (await call("/account-api/me")).json()).user, null);
count++;
const before = await (
  await status(
    await call("/study-admin/export", undefined, "", adminHeaders),
    200,
  )
).json();
const profiles = [];
for (let i = 0; i < 2; i++) {
  const email = `qa-${randomUUID()}@example.invalid`,
    password = randomUUID() + randomUUID(),
    name = `Fictional QA ${i + 1}`;
  const signup = await status(
    await call("/api/auth/sign-up/email", { email, password, name }),
    200,
  );
  const cookies = signup.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .filter((c) => c.startsWith("__Secure-better-auth.session_token="))
    .join("; ");
  assert(cookies, "Secure session cookie missing");
  count++;
  assert(
    signup.headers
      .getSetCookie()
      .some((c) => c.includes("HttpOnly") && c.includes("Secure")),
  );
  count++;
  const me = await (
    await status(await call("/account-api/me", undefined, cookies), 200)
  ).json();
  assert.equal(me.user.name, name);
  count++;
  const unchanged = await (
    await call("/study-admin/export", undefined, "", adminHeaders)
  ).json();
  assert.equal(unchanged.sessions.length, before.sessions.length + i);
  count++;
  const profile = {
    tradingStyle: "swing",
    experience: "1-3 years",
    device: "desktop",
    consent: true,
    consentVersion: "rehearsal-2026-10-18-v1",
  };
  await status(
    await call(
      "/account-api/start-review",
      { ...profile, consent: false },
      cookies,
    ),
    400,
  );
  await status(
    await call("/account-api/start-review", profile, cookies, {
      Origin: "https://untrusted.invalid",
    }),
    403,
  );
  await status(
    await call(
      "/account-api/start-review",
      { ...profile, name: "forbidden" },
      cookies,
    ),
    400,
  );
  const visit = await (
    await status(await call("/account-api/start-review", profile, cookies), 200)
  ).json();
  assert.match(visit.participantId, /^R\d{4,}$/);
  assert.equal(visit.displayName, name);
  count += 2;
  await status(
    await call("/study-admin/accounts", undefined, "", {
      Authorization: "Bearer " + visit.sessionToken,
    }),
    401,
  );
  await status(
    await call("/study-api/stop", {}, "", {
      Authorization: "Bearer " + visit.sessionToken,
    }),
    200,
  );
  await status(await call("/api/auth/sign-out", {}, cookies), 200);
  assert.equal(
    (await (await call("/account-api/me", undefined, cookies)).json()).user,
    null,
  );
  count++;
  await status(
    await call("/api/auth/sign-in/email", {
      email,
      password: "intentionally-wrong-password",
    }),
    401,
  );
  const login = await status(
    await call("/api/auth/sign-in/email", { email, password }),
    200,
  );
  const loginCookies = login.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .filter((c) => c.startsWith("__Secure-better-auth.session_token="))
    .join("; ");
  await status(await call("/api/auth/sign-out", {}, loginCookies), 200);
  profiles.push({ email, name, participantId: visit.participantId });
}
assert.notEqual(profiles[0].participantId, profiles[1].participantId);
count++;
const names = await (
  await status(
    await call("/study-admin/accounts", undefined, "", adminHeaders),
    200,
  )
).json();
for (const p of profiles) {
  assert(
    names.accounts.some(
      (a) => a.name === p.name && a.participantId === p.participantId,
    ),
  );
  count++;
}
const exported = JSON.stringify(
  await (await call("/study-admin/export", undefined, "", adminHeaders)).json(),
);
for (const p of profiles) {
  assert(!exported.includes(p.name));
  assert(!exported.includes(p.email));
  count += 2;
}
console.log(
  `${count} live account integration checks passed. Fictional rehearsal records only; no credentials printed.`,
);

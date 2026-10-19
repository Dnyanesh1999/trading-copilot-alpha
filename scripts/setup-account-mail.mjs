// Owner completes Brevo signup/sender verification first. No test emails are sent.
// Read private/account-mail.json: {"BREVO_API_KEY":"...","ACCOUNT_MAIL_FROM":"..."}
import assert from "node:assert/strict";
import { readFileSync, chmodSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const path = new URL("../private/account-mail.json", import.meta.url);
const secrets = JSON.parse(readFileSync(path, "utf8"));
chmodSync(path, 0o600);
assert(
  typeof secrets.BREVO_API_KEY === "string" &&
    secrets.BREVO_API_KEY.length > 20,
  "Provide the dedicated Brevo key in the private local file, never chat.",
);
assert(
  typeof secrets.ACCOUNT_MAIL_FROM === "string" &&
    /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(secrets.ACCOUNT_MAIL_FROM),
  "Provide the verified sender email in the private local file.",
);
const headers = {
  "api-key": secrets.BREVO_API_KEY,
  Accept: "application/json",
};
async function read(path) {
  const r = await fetch("https://api.brevo.com/v3" + path, {
    headers,
    signal: AbortSignal.timeout(15000),
  });
  assert(
    r.ok,
    "Brevo verification failed; check key permissions and account activation in the dashboard. No secrets were printed.",
  );
  return r.json();
}
const account = await read("/account");
assert(
  Array.isArray(account.plan) && account.plan.some((p) => p.type === "free"),
  "Expected the free plan. Review provider plan before activating account mail; this script will not change it.",
);
assert(
  account.relay?.enabled === true,
  "Brevo transactional email is not activated yet. Complete phone verification and transactional-account activation before enabling app mail.",
);
const data = await read("/senders");
assert(
  data.senders?.some(
    (s) =>
      s.email?.toLowerCase() === secrets.ACCOUNT_MAIL_FROM.toLowerCase() &&
      s.active === true,
  ),
  "Verify the selected sender and activate transactional mail in Brevo before continuing.",
);
const result = spawnSync(
  fileURLToPath(new URL("../node_modules/.bin/wrangler", import.meta.url)),
  ["secret", "bulk", "--config", "worker/public.wrangler.jsonc"],
  {
    cwd: new URL("..", import.meta.url),
    input: JSON.stringify({
      BREVO_API_KEY: secrets.BREVO_API_KEY,
      ACCOUNT_MAIL_FROM: secrets.ACCOUNT_MAIL_FROM,
    }),
    encoding: "utf8",
    env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
  },
);
assert.equal(
  result.status,
  0,
  "Server secret upload failed. No credentials were printed.",
);
const config = await (
  await fetch(
    "https://trading-copilot-study.dnyanesh-copilot.workers.dev/study-api/config",
    { signal: AbortSignal.timeout(15000) },
  )
).json();
assert(config.emailRecovery === true, "Server mail readiness not confirmed.");
console.log(
  "Free plan and active sender verified. Server mail enabled. No emails sent; owner must verify actual inbox delivery through the app. Never run invalid-address signup QA with live mail enabled.",
);

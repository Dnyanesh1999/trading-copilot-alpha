# Local internal logging backend — 11 October 2026

Status: implemented and verified locally on `codex/internal-journey-logging`. No cloud deployment, account provisioning, participant collection, AI integration or supervisor submission. This extends INTERNAL_JOURNEY.md; its earlier memory-only transport limitation is superseded below. The in-page event export remains memory-only, while the pending delivery queue survives same-tab reload and acknowledged events persist in local D1.

## Reproduce

Prerequisite: Node 22.12+ with npm; verification used Node 26.10.0 and Wrangler 4.149.0. Run from the repository root:

```sh
npm ci
npm run logging:setup
npm run logging:migrate
npm run logging:dev
```

In another terminal:

```sh
npm run dev
```

Open `http://127.0.0.1:5173/trading-copilot-alpha/?internalLogging=1`. Explicit DEV flag is required. The internal banner reports pending, acknowledged-this-page and dropped counts. Run a fictional review, then wait for automatic delivery or use Retry pending events. Local event timing is checkpointed every five seconds; this does not measure attention.

With the backend running:

```sh
npm test
npm run logging:check
npm run build
npm run logging:test
npm run logging:export
```

Integration checks add a fresh synthetic session, never delete prior records. CLI export writes a timestamped JSON under ignored `private/logging/`; export includes a stable high-water mark, server receipt times and original client events. No token is printed. Setup preserves existing secrets; restart Vite and Worker after changing the ignored local secret file.

## Data path and contract

Browser → same-origin Vite development proxy → loopback Worker `/events` → local D1. Only fixed event fields are accepted. No participant codes, names, emails, account identifiers, raw trades, strategy text or arbitrary payload properties. Schema/build/mode are fixed; IDs must be UUIDv4, sequence positive, timestamps canonical ISO, stages/actions enumerated, duration a nonnegative integer for visible intervals only. At most 50 events and 32 KiB per request. Invalid batches write nothing.

Event-ID retries acknowledge the same immutable event. Changed content under the same ID or different IDs sharing a session/sequence return conflict. The D1 batch is transactional, including conflict rollback. ACK removes only the submitted IDs from the client queue; arrivals during an in-flight batch remain pending. Missing or partial acknowledgements preserve the queue.

The queue uses sessionStorage to avoid competing tabs overwriting one shared localStorage queue. Retry delays increase to 60 seconds; each request has a five-second timeout. Network/5xx/429 failures retry automatically. Other 4xx responses pause automatic delivery for inspection, with explicit retry available after fixing the cause. Corrupt queues are preserved and collection paused; inspect before resetting. Overflow is visibly counted. Browser queue storage failures are surfaced; memory fallback is not durable.

Separate ingest/export random local tokens live in ignored `worker/.dev.vars`, created with owner-only permissions. Vite injects only the ingest token on the server side; export token never goes to the browser. `/export` requires its own bearer token, uses no-store responses and paginates up to 100 records against a fixed upper ordinal. Neither token can serve the other's route. Origins outside the local app are rejected; no permissive CORS. Runtime hostname/mode gates, dummy database ID and disabled public Worker routes intentionally prevent using this configuration as a public collector.

## Verified evidence

- 107 automated tests pass: 82 original review/storage checks, 5 prior logger checks, 20 schema/outbox checks.
- Frontend TypeScript/production build and separate Worker TypeScript pass.
- 24 integration checks against real local Worker/D1 pass: authentication separation, foreign Origin rejection, unknown fields, wrong mode/types, invalid JSON/content type/size, duplicate retries, conflicts, transaction rollback, concurrent duplicate requests and snapshot pagination.
- Browser: Start → confirm → open evidence → choose later → save → backend acknowledgement. Exported session has exactly one review start, rules confirmation, evidence open and successful save.
- Browser outage: stop backend → pending events/error visible → reload same tab → 10 pending records survive → restart backend → all 10 acknowledged, zero dropped.
- Database restart preserves all earlier exported event IDs.
- Saved-review reopen exported as browsing, without a new review-start or completion.
- Production preview with the internal query flag shows no logging banner; disabled logger test collects nothing. Built JS checked for both actual local secret values: absent.
- Private browser screenshot and export receipts retained outside public source history.

## Practical limits and next steps

This is a local development collector. It is not internet-hosted or a participant-ready service. Wrangler's local developer tooling and database files are accessible to the local machine owner; application route tokens are not a security boundary against that owner. Local D1 files are not claimed encrypted. No production load/security audit, rate limiting, consent, study identity, retention/deletion workflow or institutional storage approval is provided.

Pending events can be lost when a tab is closed or browser storage fails. Browser crash/unload may lose the final timing interval; server records alone cannot prove that nothing was dropped before delivery. Client timing is untrusted, and incomplete sequences must not be reported as complete journeys. The page export has a 10,000-event cap; the pending queue holds 2,000 events. Stop and inspect any dropped count. The internal queue must not be reused for actual participant collection without completing the data-quality/consent design.

Next bounded work: targeted core UX simplification for the Tuesday milestone. Then resolve cloud ownership/provider/retention, implement a separate internal cloud configuration and verify transport/export there before any participant rollout. Participant collection remains gated by final materials and ethics clearance.

## Primary implementation references

Cloudflare documents local-only D1 development and persistent local state in [Local development](https://developers.cloudflare.com/d1/best-practices/local-development/). Database batching and prepared statements follow the [D1 database API](https://developers.cloudflare.com/d1/worker-api/d1-database/) and [prepared-statement API](https://developers.cloudflare.com/d1/worker-api/prepared-statements/). Local secret handling follows [environment variables and secrets](https://developers.cloudflare.com/workers/local-development/environment-variables/). Consulted 11 October 2026; implementation behaviour verified separately above.

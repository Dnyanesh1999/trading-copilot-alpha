# Local strategy clarification

The strategy helper sends a short description and clarification answers to Gemini. It proposes only the app's five existing checks. Trade review findings and calculations remain deterministic, and the trader must edit/confirm the proposed rules. Missing values remain unresolved. Indicators, account-percentage risk, options, actual broker stop execution and profitability predictions are outside this version.

## Free-first setup

Use a Gemini API key from a project on the **free tier with billing disabled**. Google AI Pro includes Developer Program benefits with $10 monthly Cloud credits and higher limits for selected models in AI Studio. Subscription ownership alone does not establish an API key, project quota or eligibility to apply those credits. Google's Prepay billing documentation requires a purchased positive prepaid balance before eligible Cloud credits can be consumed. This code cannot determine the account's billing tier or credit eligibility and does not activate billing, buy credits, install an SDK, or create a key. No payment is authorized; do not connect a billed project or buy prepaid funds without a separate cost decision.

Provide `GEMINI_API_KEY` to the server environment, or place it in the ignored project-root `.env.local` file yourself. Never use a `VITE_` key name. The server optionally reads `.env.local` with Node's `process.loadEnvFile`; inherited environment values take precedence. Do not paste keys into chat or source files. Optional server variable `GEMINI_MODEL` overrides the default `gemini-3.5-flash-lite`.

In one terminal run `npm run ai:dev` (script: `node server/strategy-api.mjs`); in another run `npm run dev`. The API binds only to `127.0.0.1:8788`; Vite proxies `/strategy-api/strategy`. Restart both processes after configuration changes. Without a key or running server, the UI reports unavailable and manual rule entry continues. Static GitHub Pages cannot run this server; no production endpoint has been deployed.

The server accepts only small JSON requests from the local development origins on port 5173, enforces timeouts, limits concurrency and requests, and does not log text, keys, raw provider failures or responses. It sends only the description/answers, never trade records. It does not store prompts or results server-side. The client validates returned rule IDs and values before using proposals.

## Data use and verification limits

**Current route is for internal fictional, non-sensitive examples.** Free Gemini content may be used to improve Google products, and human reviewers may process inputs/outputs. Do not enter participant information, personal/account records, confidential strategies or credentials. Participant use stays disabled pending final disclosures, provider decisions and ethics confirmation. Local development does not establish study readiness.

The default is a stable model documented as supporting structured output. Free-tier quotas and model access depend on Google's current account/project limits; no quota or availability guarantee is made. Rate limit/failure returns an honest error, with no silent paid model fallback. Model-generated semantics can still be mistaken: review every rule and unresolved question before confirming.

Verified against official Google sources on 17 October 2026:

- [Gemini 3.5 Flash-Lite](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite): stable identifier and structured output support.
- [Pricing](https://ai.google.dev/gemini-api/docs/pricing): model has free input/output tokens, subject to limits; unpaid content used for product improvement.
- [Terms](https://ai.google.dev/gemini-api/terms): unpaid input/output processing and human review; do not submit sensitive, confidential or personal information.
- [Google AI Pro benefits](https://support.google.com/googleone/answer/14534406?hl=en): Developer Program monthly Cloud credits and selected AI Studio higher limits; membership/profile eligibility requirements apply.
- [Gemini API billing](https://ai.google.dev/gemini-api/docs/billing): eligible Cloud credits on Prepay require a purchased positive prepaid balance; not all Cloud credits apply.
- [GenerateContent API](https://ai.google.dev/api/generate-content) and [structured output](https://ai.google.dev/gemini-api/docs/structured-output): server REST request and JSON schema output; application validation still required.

No live inference or API-key verification was performed during implementation. Tests use fictional text and a fake provider transport. A real response is still required to verify account access, quota, latency and interpretation quality. Do not report fake transport tests as model accuracy or research results.

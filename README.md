# Trading Copilot

A guided strategy-aware trading review: **your rules → your session → your next step**. Static alpha for supervisor UX review; every trade is fictional.

## Run locally

Node.js 22.12+ or a supported newer Node release; npm.

```sh
npm ci
npm run dev
npm test
npm run build
```

Vite serves the app under `/trading-copilot-alpha/`. Production output is `dist/`.

## Shared context

- [Specification](docs/SPEC.md), [current status](docs/STATUS.md), [design reference](docs/DESIGN.md).
- [Antigravity brief](docs/handoffs/ANTIGRAVITY.md), [Claude brief](docs/handoffs/CLAUDE.md), [Gemini brief](docs/handoffs/GEMINI.md).

The guided static alpha is implemented, with a richer five-check revision requested on 7 October. [Open the live alpha](https://dnyanesh1999.github.io/trading-copilot-alpha/). See [verification and limitations](docs/verification/VERIFICATION.md) and the [shared collaborator baseline](docs/REVIEW_BASELINE.md). Original September source could not be located after Antigravity was reinstalled; this is a fresh build from preserved requirements and approved concepts.

## Capability boundaries

Five explicit checks, fictional directional equity fills and timestamped stop/target plans, deterministic review and local saved focus. Two entry controls remain visible; three additional plan checks sit under a disclosure. No broker import, order execution, live model, arbitrary strategy extraction, deployed backend, shared participant data collection or demonstrated behaviour/profitability improvement. A recorded stop plan is available in some fixtures; actual broker stop execution and breakout validity are not established. Local browser data is not an evaluation dataset.

## Historical supervisor direction — 1 October

1 October feedback aligned on trading copilot starting with strategy-aware review. Static data is acceptable for the working alpha; repository/live page requested for professor review before trader testing. Fifteen survey responses requested. Survey rechecked 7 October: still nine submissions; student now targets ten (one more); professor’s written target remains fifteen. See [verified counts](docs/SURVEY_SNAPSHOT.md).

All code and assets in this repository are prepared with AI assistance. See docs/AI_ASSISTANCE.md for provenance and verification limits.

## Internal logging development

Optional local Worker/D1 collection is available only in explicitly enabled development mode. It is not deployed or participant-ready. See [setup and verification](docs/verification/LOCAL_BACKEND.md). Default and production demo tracking remains disabled.

## Current checkpoint — 12 October 2026

User-approved motion polish is implemented, with 107 passing tests/build and desktop/mobile production checks. Current app baseline 5784fb5. 8 October supervision reviewed the alpha positively and agreed about ten beta traders; survey remains n9 last checked 11 October. Trader recruitment descriptions remain pending. No participant results or external AI reviews. Read docs/STATUS.md for deployment evidence.

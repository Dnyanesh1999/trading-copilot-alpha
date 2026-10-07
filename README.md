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

Initial baseline is a runnable scaffold, not a finished alpha. Follow docs/STATUS.md for actual verified release status. Original September source could not be located after Antigravity was reinstalled; this is a fresh build from preserved requirements and approved concepts.

## Capability boundaries

Two explicit rules, fictional execution records, deterministic checking and local saved focus. No broker import, order execution, live model, arbitrary strategy extraction, backend, shared participant data collection or demonstrated behaviour/profitability improvement. Breakout and stop-loss evidence is not available. Local browser data is not an evaluation dataset.

## Supervisor direction

1 October feedback aligned on trading copilot starting with strategy-aware review. Static data is acceptable for the working alpha; repository/live page requested for professor review before trader testing. Fifteen survey responses requested. Last independently checked survey snapshot: nine submissions on 1 October; current total must be rechecked.

All code and assets in this repository are prepared with AI assistance. See docs/AI_ASSISTANCE.md for provenance and verification limits.

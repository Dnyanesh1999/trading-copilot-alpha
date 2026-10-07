# Shared collaborator baseline

Original sanitized runnable scaffold: `37f6f05` (published before UI implementation).

Shared current app baseline: `15d26a6` (richer five-check revision, 7 October 2026). Earlier two-rule implementation: `b4013e5`. Every collaborator should inspect this same commit first, then compare the current main branch for later integration changes. Record both SHAs in the returned review. Additional documentation commits do not change this app baseline.

Repository: https://github.com/Dnyanesh1999/trading-copilot-alpha
Live alpha: https://dnyanesh1999.github.io/trading-copilot-alpha/

| Owner | Branch | File ownership |
|---|---|---|
| Codex | codex/richer-static-review | src/core, src/App.tsx, fixtures, tests, integration, CI/deployment |
| Antigravity | codex/antigravity-ui | src/components, src/styles.css, public illustration; coordinate changes with Codex |
| Claude | codex/claude-review | docs/reviews/YYYY-MM-DD_claude.md only |
| Gemini / Google AI Pro | codex/gemini-review | docs/reviews/YYYY-MM-DD_gemini.md only |
| User | — | forward briefs, recruitment details, professor communication |

Codex has implemented the first complete UI to make the alpha reviewable now. Antigravity's next deliverable is a bounded UI/interaction refinement against the approved references and actual rendered alpha, on its own branch. Keep the contracts and deterministic findings intact. Recommendations are not automatically adopted. External Claude/Gemini/Antigravity reviews have not yet been received.

The private project-control directory remains outside this repository. Never add private portal links or participant/account identifiers.

Current scope: five deterministic checks, directional fictional fills, timestamped plan records, outcome separated from adherence, and progressive risk settings. Review the revised SPEC.md and verification/RICHER_REVIEW.md. This expansion is requested by the user; no new supervisor approval or external review is claimed.

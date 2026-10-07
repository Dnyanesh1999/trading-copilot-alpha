# Shared collaborator baseline

Original sanitized runnable scaffold: `37f6f05` (published before UI implementation).

Shared implemented app baseline: `b4013e5`. Every collaborator should inspect this same commit first, then compare the current main branch for later integration changes. Record both SHAs in the returned review. Additional documentation commits do not change this app baseline.

Repository: https://github.com/Dnyanesh1999/trading-copilot-alpha
Live alpha: https://dnyanesh1999.github.io/trading-copilot-alpha/

| Owner | Branch | File ownership |
|---|---|---|
| Codex | codex/static-alpha | src/core, src/App.tsx, fixtures, tests, integration, CI/deployment |
| Antigravity | codex/antigravity-ui | src/components, src/styles.css, public illustration; coordinate changes with Codex |
| Claude | codex/claude-review | docs/reviews/YYYY-MM-DD_claude.md only |
| Gemini / Google AI Pro | codex/gemini-review | docs/reviews/YYYY-MM-DD_gemini.md only |
| User | — | forward briefs, recruitment details, professor communication |

Codex has implemented the first complete UI to make the alpha reviewable now. Antigravity's next deliverable is a bounded UI/interaction refinement against the approved references and actual rendered alpha, on its own branch. Keep the contracts and deterministic findings intact. Recommendations are not automatically adopted. External Claude/Gemini/Antigravity reviews have not yet been received.

The private project-control directory remains outside this repository. Never add private portal links or participant/account identifiers.

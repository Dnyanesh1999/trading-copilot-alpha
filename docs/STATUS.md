# Status — richer static alpha

7 October 2026. User-requested five-check revision implemented; the existing guided flow and approved design preserved. Fresh implementation; original September source unavailable.

- App baseline: `984682a`. Previous two-rule baseline: `b4013e5`; original sanitized scaffold: `37f6f05`.
- Public repository: https://github.com/Dnyanesh1999/trading-copilot-alpha
- Pages URL: https://dnyanesh1999.github.io/trading-copilot-alpha/
- Local verification: 82 Vitest checks, TypeScript and production build pass. Chrome desktop 1505×1045/mobile 390×844 flow verified without horizontal overflow or app console errors/warnings. See [current verification](verification/RICHER_REVIEW.md); prior two-rule ledger remains historical.
- Default 20 findings: 13 followed, 5 deviated, 2 insufficient evidence. Five checks: daily limit, entry cutoff, pre-entry stop recording, planned price risk, planned reward-to-risk. Outcome remains separate from adherence.
- Save/reload retains actual session, rule snapshot, focus and selected position. Legacy two-rule saves remain compatible. Explicit save replaces one browser-local record.
- [Same baseline and assignments for collaborators](REVIEW_BASELINE.md); updated external briefs prepared, no external reviews received yet.
- Survey snapshot remains nine submissions verified earlier on 7 October. Student target ten; professor's written target fifteen, reduction not approved. Recruitment eligibility remains unconfirmed. [Verified survey snapshot](SURVEY_SNAPSHOT.md).

Release evidence: the initial five-check publication passed [Actions run 37611352991](https://github.com/Dnyanesh1999/trading-copilot-alpha/actions/runs/37611352991), including npm ci, 82 tests, production build and Pages deployment. The public browser served the five-check welcome and restored a legacy two-rule saved session without changing its data. Current app baseline 984682a additionally makes evidence-availability wording derive from the restored review. Follow the [latest main deployment](https://github.com/Dnyanesh1999/trading-copilot-alpha/actions) for current release status; the production UI is unchanged except that compatibility wording.

Limits: entirely fictional static equities, no login, live AI, broker or backend. Stop-plan timing cannot prove a protective order or actual stop execution. No profitability improvement, participant results or central usage dataset. User-requested extra checks are not a new supervisor approval. Professor reviews before trader testing; usage metrics still to be agreed. Supervisor update remains a private draft for the user to send.

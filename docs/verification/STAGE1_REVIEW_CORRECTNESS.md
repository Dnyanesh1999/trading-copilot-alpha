# Stage 1 — review correctness (21 October 2026)

Scope: the approved first checkpoint only. The four trade audit supplied by Dnyanesh is the before-state reference. Regression inputs in `src/core/stage1-regression.test.ts` are fictional and are not participant results or historical market data.

## Behaviour

- Manual entry requires an initially unselected Had a stop / No stop / Not recorded choice. Had a stop requires an initial price and either a recorded IST time or an explicit unknown-time choice. No stop breaks a selected stop-before-entry rule. Not recorded remains unresolved. Blank legacy/imported stops remain unresolved without silently inferring No stop.
- Reported price risk and reward-to-risk are calculated from available complete fills and valid initial levels even when the plan is late or its recording time is unknown. A late plan cannot establish the original pre-entry values. A breached reported comparison appears as Needs review with the numerical value and basis; the underlying rule status stays unverified. Pre-entry violations still use Broke rule.
- Initial stop and target must be on the correct side of entry for long and short positions. Manual and app CSV imports reject wrong or equal levels with field/row errors. Older saved reviews with invalid levels remain readable but show an Invalid initial stop/target warning and do not turn green.
- Review allows the stop declaration, initial price and recording time to be corrected. Findings and counts recalculate immediately. Local History changes only after Save review & action plan; private account backup still needs its separate explicit save.
- The shared `reviewCounts` function supplies Review, History and JSON export. New saves carry review logic version 2; older records are recalculated on read with an explicit notice, preserving inputs, confirmed rules and saved date until the user saves again. New rehearsal event rows use `study-rehearsal-stage1-v2`; historical rows keep their original build value.

## Checks

- 216 Vitest tests passed, including fictional TCS clean, INFY late ₹1,200 against ₹800 and 1R against 2R, HDFCBANK explicit No stop, RELIANCE invalid initial stop, long/short geometry, equal time, missing quantities/prices, old CSV and old review compatibility.
- Frontend production build and Worker TypeScript check passed. Vite reports the pre-existing large Orbit chunk warning.
- Local Playwright CLI at `http://127.0.0.1:5173/trading-copilot-alpha/`: manual required-choice error, No stop result, invalid/valid correction, explicit local save, unsaved correction leaving History untouched, CSV row 2 stop_price rejection and late-plan import/review. Desktop 1280×800 and mobile 390×844 rendered; mobile document width stayed 390px. No app console errors; one existing Three.Clock deprecation warning.
- The earlier CSV error toast remained visible after a later valid import. Toast lifecycle is Stage 2 and was not mixed into this correctness change.

No real trades, participant sessions, account cloud copies or research records were changed during local QA. Read-only inspection of the owner's live account found one likely audit copy titled `Trade review · 2026-10-19`, with TCS/INFY/HDFCBANK/RELIANCE and the ₹800 cap. Opening it through the app also restored a local browser copy. The exact review ID and linked study session were not obtained before browser control stopped, so no deletion or research exclusion has been applied. Before cleanup, match account, exact saved time, review ID and trade contents, then record an explicit exclusion without touching genuine participant rows.

# Coded study sessions

The study entry route is `?study=1`; the researcher desk is `?researcher=1`. The deployment defaults to an internal fictional rehearsal. External participant collection requires explicit ethics confirmation, final information text/version, and the participant-mode configuration gate. A working demo does not establish clearance.

Each private invitation maps an unguessable code to a label. Codes identify possession of an invitation, not a verified person. No email/password account is needed. The name-to-label list stays outside the app and repository. Invitations and session tokens are hashed in the database; the researcher credential is separate. A returned visitor may create another session, so count unique labels separately from sessions.

## Data model

| Table | Grain and contents |
| --- | --- |
| participants | One coded profile: style, experience category, device, first session date |
| sessions | One consented visit: coded label, consent version/time, app version, mode, status, AI call budget |
| tasks | Four task assessments per finished visit: completion, visible task time, self-reported help, evidence opened, measurement source |
| ratings | Thirteen item responses per finished visit: original ten SUS items and three separate project items; skipped answers stay null |
| comments | Optional text/theme/source with a flag requiring researcher redaction review |
| usage_events | Allowlisted event IDs, task IDs, durations and AI outcome counts; no strategy text, trades, filenames or general event properties |
| study_invites | Hashed invitation code, label, issue time |

SUS wording is defined in `src/study/protocol.ts`. The original Brooke questionnaire source and the project questionnaire are maintained in the private study package. Complete SUS responses may be scored separately; the three project items are not a validated composite. The current UI represents non-response as Skip; distinct reasons for missing answers remain a participant-protocol decision.

Task completion/help are self-reported, not independent observer measurements. Visible time excludes hidden-tab time and the questionnaire after leaving the review. It measures time in an active task, not cognitive attention. AI counters compare the last in-memory proposal with confirmed rules; a reload can lose this comparison rather than creating evidence of acceptance. They are not an accuracy score.

Trade files and saved reviews remain in the isolated browser-session workspace. AI clarification separately sends strategy text/answers to Google through the server. Only fixed study activity and explicitly submitted feedback reach the study database. Free text still needs researcher review for identifying information.

## Storage and access

The deployed Worker serves static assets, same-origin study APIs and a session-scoped Gemini route. D1 is a separate database created with EU jurisdiction. Worker application observability is disabled deliberately to avoid recording study text or credentials in application logs; this does not imply the platform keeps no operational metadata. Final participant materials must describe the actual providers, retention, withdrawal and contacts before participant mode is enabled.

The study header distinguishes pending activity from server-acknowledged saves. The outbox survives same-tab reload. Finish awaits acknowledged activity and an atomic questionnaire/task transaction; identical retries do not duplicate results. A stopped session retains earlier consented activity but does not submit a questionnaire. A closed session cannot append activity. Keep a tab open when connectivity fails. Clearing a finished session clears its browser workspace and questionnaire draft, not unrelated owner records.

Local development uses ports 5173 (UI), 8788 (Gemini) and 8789 (rehearsal D1). The local researcher desk with `?researcher=1&cloud=1` uses a loopback-only development proxy to the deployed study collector, injecting the researcher credential server-side. Without `cloud=1`, the local desk shows local rehearsal records. On the remote researcher page, a separate access key must be entered; it is never a participant code.

## Deployment and verification

Use `worker/public.wrangler.jsonc` for the combined deployment, and `worker/study.wrangler.jsonc` for the separate local rehearsal server. The old internal logger is unchanged. Remote database migrations are in `worker/participant-migrations`; do not apply local historical migrations to a different database blindly. Upload only the Gemini key and study researcher credential as Worker secrets using protected stdin; never include values in source, command arguments, screenshots or exports.

Commands: `npm test`, `npm run build`, `npm run logging:check`, `npm run study:check`. The backend check defaults to loopback; an explicitly allowlisted `STUDY_CHECK_URL` targets the deployed rehearsal collector and writes only synthetic records. It does not recruit or impersonate participants.

Release evidence is maintained outside the public repository. Provider/disclosure decisions, email verification and successful deploy status must be recorded separately from local checks. No result from the synthetic QA runs counts as a participant or held-out model experiment.

## Verified release — 18 October 2026

Online rehearsal: https://trading-copilot-study.dnyanesh-copilot.workers.dev/?study=1. Final Worker33615554-f2b4-478b-a8fe-9874b92e87d2 serves assetindex-P39C_YE1.js. 199 unit/regression tests, build, Worker type-check and37 remote integration checks passed. A real cloud browser journey used Gemini, fictional CSV review and the complete questionnaire, then verified persisted completion and four CSV exports. An intentional offline submission retained form answers and succeeded on retry. Mobile entry has no horizontal overflow. Final remote researcher view was checked with no credential and displayed no session rows. Browser plugin not available; Playwright CLI used. No real participant data or held-out model results were created.

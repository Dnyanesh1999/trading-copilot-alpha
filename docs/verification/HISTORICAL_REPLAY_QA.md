# Historical replay integrity verification

## Step 5 — 11 November 2026: live instrument lookup

The owner/Claude reported a repeatable local 502 before candle loading. A token-free public curl check confirmed `GET https://api.dhan.co/v2/instrument/NSE_EQ` returns HTTP 302 (no content type on the redirect), then HTTP 200 with `application/octet-stream` after one redirect to the S3 instrument CSV. The public master contains 10,271 data rows (10,272 including its header), all expected field names, and exactly one NSE/EQUITY/EQ/SBIN match with SECURITY_ID 3045. The full public header is captured as the synthetic regression fixture and private endpoint-check metadata; response bodies and signed redirect URLs are not logged.

Root cause: instrument fetch used `redirect: "error"`. The same pre-fix Node option reproduced `fetch failed`, cause `unexpected redirect`. The existing CSV parser successfully parsed all 10,271 downloaded rows and found ID 3045: the current header, 20,000-row limit and authentication were ruled out as causes for this response. Instrument fetch now follows its token-free public redirect; credentialed candle fetch retains `redirect: "error"`. Instrument parsing has its own 1,000,000-row allowance.

Catch failures emit exactly one development-terminal line `[dhan-history] stage=<stage> reason=<message>` with instrument HTTP/parse, candle HTTP/parse or coverage stage. Reasons redact the configured token and URLs, collapse control characters and omit stacks/headers/bodies. JSON decoding errors become a fixed message because native JSON errors can quote response bodies. UI errors name the failed operation and include a stage field; coverage errors retain their specific explanation. Existing input/auth/access/rate-limit mappings stay intact.

305 tests across 26 files, production build and logging type-check passed. New tests cover the exact real public header with 20,002 synthetic data rows and SBIN after row 20,000, redirect policy/token-free instrument options, each failure stage, malformed JSON body exclusion, token/URL redaction and one-line logging. Existing build warnings remain. The owner's already-running local route on port 5177 then returned HTTP 200, 42 dated candles and the selected 2022-12-15 entry in 3.31 seconds; no candle-stage failure occurred. This was an HTTP route check, not a completed browser replay test. Owner restart and browser retest are requested using the same hidden-token command. Private metadata: canonical `06_Experiments/2026-11-11_Dhan_Instrument_Lookup_QA/endpoint-check.json`.

`src/core/review.ts`, Worker files and deployment workflow are unchanged from `011a837`. No merge, PR or deployment.

## Step 2 — 11 November 2026

User-reported Claude verification of `a1f0c45` preceded this bounded follow-up. The weekend policy below supersedes Step 1's blanket rejection.

- Both sources accept weekend candles. New snapshots retain chronological `weekendDates` for both sources; only CSV reviews display the request to verify the session. Validation recomputes and matches the list. Existing Step 1 evidence without the field remains valid only when its bars contain no weekends; older reviews without series still load. Coverage still rejects gaps over five calendar days.
- With series present, restore requires one simulated entry whose price/date match bar 21, a signal close/date matching bar 20, and signal reference equal to the maximum high of bars 0–19. Tampered verdict inputs are rejected independently of the evidence hash.
- Dhan normalisation validates timestamps/prices/volume and duplicate dates, then filters valid candles outside the inclusive requested window. A missing entry still fails. `DH-905`, `811`, `812`, `813` and `814` return HTTP 400 with input-correction guidance.
- Two-decimal replay banner, setup comparison and supporting records are presentation only. Stored bars, engine inputs, findings and hashes retain their original precision. Replay reviews replace stop correction with simulated-plan guidance; action/focus instructions describe the replay. New and previously saved local history rows display symbol, date and Dhan/CSV source.
- 294 tests across 26 files pass, including weekend acceptance/audit validation, six-day rejection, signal close/reference/date and entry-price tampering, out-of-window filtering, all five HTTP error mappings, two-decimal rendering and absent replay stop editor with ordinary editor preserved. Production build and logging type-check pass; existing Vite native-loader and bundle-size warnings remain.
- Isolated local Chrome/Playwright verified both SBIN examples using simulated Dhan responses populated from the private archived CSV. 15 December 2022: signal 625.50 > resistance 619.80, entry 625.55, 10 shares, simulated stop 610/target 660, all assessed checks followed. 30 December 2022: 611.80 ≤ 629.55, entry 615.25, blank stop/target, setup deviated and risk-plan checks insufficient. Banner/proof, no stop editor, replay guidance, export with independently recomputed SHA, save/reload, complete history labels and signal-only tamper rejection passed with no page errors/desktop overflow. Both full-page screenshots visually inspected. No live provider calls. Script, results and images stay private in the canonical `06_Experiments/2026-11-11_Replay_Step_2_QA/` folder, outside this repository.
- `src/core/review.ts`, Worker files and deployment workflow remain byte-identical to `a1f0c45`. No PR, merge or deployment.

## Step 1 — historical verification

11 November 2026. User-requested follow-up on `codex/historical-replay`.

## Checkpoint and scope

Before edits, all 264 existing tests, production build and logging type-check passed. The working tree was committed as `110d009e4eb557802fe79af3a185715dd6794cd7` with the requested checkpoint message and pushed to origin. The named private Claude QA file was not present in the available project folders; B1, B2 and B5 were implemented from the explicit task text.

## Evidence format

Each new replay snapshots exactly 22 chronological rows (20 lookback, signal, entry), source, acquisition/import time, optional CSV filename and SHA-256. Optional volume is non-negative and remains unused by the rules. Only the used rows receive the calendar coverage check: weekends and gaps over five calendar days are rejected, with the offending date or interval in the message. `maxGapDays` is retained. Exchange holidays are not modelled.

Canonical bytes are UTF-8 CSV with header `date,open,high,low,close,volume`, that fixed field order, chronological rows, JavaScript number string representations, blank absent volume, LF separators and a final LF. Filename/time/source are metadata outside the hashed bytes. Browser/Node snapshot generation uses `crypto.subtle.digest("SHA-256", ...)`. Existing synchronous saved-review/Worker callers verify the same bytes using `@noble/hashes` 2.4.0, already installed transitively and now declared directly; their interface stays synchronous. A Node built-in crypto oracle independently checks parity in the test. SHA-256 is an integrity checksum, not authentication of the data publisher.

Present evidence requires 22 valid OHLC/volume rows, chronological weekday coverage, valid provenance, matching maximum gap/window dates and a matching recomputed hash. Legacy reviews without `series` remain readable. Setup proof shows source, fetch/import timestamp and the first 12 checksum characters. Export keeps the full series. Snapshot construction copies allowed evidence fields only; injected token fields are not copied, and the validator rejects unexpected fields in series/bars. The local Dhan route keeps credentials server-side and returns bars plus fetch time.

## Verification

- Final checks passed: 277 tests across 25 files (264 existing + 13 added), production build and logging type-check. Browser QA also passed as described below.
- Added cases: weekend rows, six-day rejection, five-day acceptance, unused-row exclusion, stable WebCrypto hash with independent Node oracle, valid-OHLC tampering, bad checksum, old snapshots, malformed evidence, optional/zero/invalid CSV and Dhan volume, Dhan coverage and explicit injected-token exclusion.
- Isolated local Chrome/Playwright: CSV upload → replay → setup proof with timestamp/short hash → JSON export with 22 rows/volume and independently recomputed SHA → save → reload preserves evidence → tampered local bar rejected. Mocked Dhan fetch → replay → proof/export retains Dhan provenance and identical bars/hash. No browser page errors. Proof screenshot visually inspected; no live Dhan request or real market/participant records used for this QA.
- `src/core/review.ts`, Worker files and deployment workflow remain byte-identical to the checkpoint. No PR, merge or deployment. Existing Vite native-loader migration and bundle-size warnings remain.

# Historical replay integrity verification

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

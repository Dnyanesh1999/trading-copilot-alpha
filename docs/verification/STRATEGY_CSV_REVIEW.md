# Strategy library and CSV review — 18 October 2026

Implemented locally at the user's request; not deployed. The intended loop is setup → confirm rules → select/import records → review evidence → save one practice action.

## Presets and scope

Three long-equity presets: resistance breakout, 20-period simple moving-average reclaim and opening-range breakout. Each checks supplied completed-signal context strictly before the first entry, alongside selected risk controls. Shorts remain supported by existing risk calculations, but these new setup conditions return insufficient evidence for shorts. Missing/late signals stay unknown; an observed supplied-price mismatch is a deviation. No live feed, chart reconstruction, indicator calculation, resistance detection, backtest, order execution or profitability claim.

- Breakout: supplied signal close above documented resistance.
- SMA reclaim: previous close at/below its supplied 20-period SMA, then signal close above its supplied SMA. Same timeframe/completed candles are user-recorded assumptions, not independently verified.
- Opening range: this app explicitly defines 09:15–09:30 IST; supplied signal at/after09:30, above range high, strictly before entry, same IST date. Default cutoff11:00 and at most3new positions; these and ₹500/2R are editable teaching defaults, not validated trading recommendations.

Preset definitions are operational examples, not complete validated trading systems. [Schwab's swing-trading overview](https://www.schwab.com/learn/story/ins-and-outs-swing-trade) describes breakout/bounce concepts. [Fidelity's SMA guide](https://www.fidelity.com/learning-center/trading-investing/technical-analysis/technical-indicator-guide/sma) explains the indicator. [NSE market timings](https://www.nseindia.com/static/market-data/market-timings) supports09:15 market open, not endorsement of our15-minute variant. Sources checked18October2026.

## Data provenance and CSV

All12 preset positions (four per setup) are code-generated, deterministic teaching fixtures, with invented instruments/prices and deliberate cases: compliant gain, compliant loss, setup/sizing deviation and missing evidence. No real trader records or market dataset acquired. No random seed: no sampling. Files in docs/examples reproduce UI downloads and retain data_source=fictional on reimport. The label is declared metadata, not authenticated provenance. Unlabelled input defaults user-supplied/unverified.

[Zerodha documents tradebook CSV/XLSX export](https://support.zerodha.com/category/console/reports/other-queries/articles/where-can-i-see-all-the-trades-i-ve-taken-for-a-particular-period). Execution records alone cannot establish a trader's original plan or signal. Current importer accepts the app template, NOT raw broker schemas. A broker-specific mapping is still future work. Users must supply only documented context; unknowns remain unknown.

CSV: one initial entry and optional full exit per row, explicit-offset ISO timestamps, 1MB/200positions maximum. Required columns instrument,direction,quantity,entry_price,entry_at. Optional exit, stop/target, plan time, signal/reference/prior SMA/range-end and data_source fields. Rejects malformed quoting, duplicates, nonfinite/invalid values, partial exit pairs, ambiguous dates, unknown/private headers and spreadsheet-formula instrument labels. No upload network request. Daily completeness is explicitly asserted; selecting a subset revokes it. Export refuses multi-fill/partial-exit shapes rather than silently flattening them.

## Review actions

Replace the generic focus dropdown with up to3 ranked cards: confirmed deviations first (pre-entry plan, risk cap, entry setup, reward/risk, daily limit, cutoff), then missing evidence. First card has Recommended first. This is a fixed transparent product priority, not a learned/validated optimal intervention. Selected action provides steps and an evidence link to the exact position/check. Sizing uses the actual entry-stop distance and chosen cap (whole units, excluding fees/gaps). Losses alone do not create an error recommendation. Save retains the action title and immutable review; details derive from that snapshot. Legacy saved focuses remain visible.

## Verification

191 automated tests across12files; frontend build and Worker typecheck pass. Browser development QA: Try sample opens chooser; explicit setup confirmation; row selection/zero-selection guard; losing-only sample remains followed; all3presets; risk action100units at₹5distance vs₹500cap; keyboard radio arrows; exact evidence focus; save/reload; CSV download/reupload with fictional label; no import request;390×844 no document overflow; reduced-motion animation-name none. Full200position persistence regression included.

Initial browser script's final reduced-motion assertion expected0.01ms but CSS deliberately uses animation:none; corrected assertion verified none. Earlier screenshots caught entrance animation in progress; final captures wait for animation completion. No user-test or accessibility-certification claim. Known pre-existing Three.js Clock deprecation and large lazy Orbit chunk remain. No Gemini inference in this change. No public deployment or participant collection.

Private screenshot/CSV/journey evidence: canonical06_Experiments/2026-10-18_Strategy_Library_QA. ImageGen concept: docs/design/strategy-library-concept.png; final UI uses code-native SVG/CSS with reduced-motion guards, existing Three.js overview retained.

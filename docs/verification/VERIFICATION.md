# Initial two-rule alpha verification — 7 October 2026

Historical verification for the initial release. See [richer five-check verification](RICHER_REVIEW.md) for the current revision.

Implemented app baseline: b4013e5. Verification by Codex; no claim of trader or external-provider evaluation.

## Reproducible core checks

`npm ci`, `npm test` and `npm run build`. 50 Vitest checks pass; strict TypeScript and production build pass. Cases cover D violating both rules, fills grouped once, duplicate position identity, IST midnight, strict cutoff with seconds/milliseconds, incomplete daily counts, missing/invalid first timestamps, unavailable first-entry coverage, tied entry order, changed rules, immutable snapshots, corrupt/stale persistence, denied storage and all focus choices.

An independent Codex subagent wrote the core tests and exposed a summary regression: only a daily-limit deviation with other unresolved counts incorrectly said “A late entry.” Fixed to derive wording from actual time findings. This is not a Claude/Gemini audit.

## Browser acceptance

Used the Codex in-app browser for the complete desktop flow, evidence, incomplete data, editing rules, local save/reload, and saved snapshot recovery. Used Chrome through CUA for final reliable full-page captures, desktop/mobile review, keyboard activation, Escape, help, reset cancellation/confirmation and reload after reset. IAB full-page capture had scaling/clipping artefacts, so final screenshots use Chrome. No terminal Playwright fallback.

Desktop viewport verified at 1505 × 1045 (the welcome concept's native size). Review reference is the same visual family. Mobile verified at 390 × 844, vertical timeline, stacked controls, no horizontal page overflow. A requested 320-wide override was clamped by the browser to 390; 320 is not claimed verified. Mobile uses the specified responsive sequence; no separate approved mobile concept was supplied.

- New user: Welcome → Try sample → explicitly confirm 3 / before 11:00 → explore D → choose focus → save → completion. No login/setup.
- D shows 4th position and 11:20 IST. Evidence lists all five execution records, including A's two fills, with links to source rows.
- Incomplete mode shows four unresolved daily-count checks and one confirmed time deviation. Available timestamps still support the time checks.
- Changed rules 4 / 12:00 show all eight checks followed, labelled comparison against sample history. A saved 3 / 11:00 review retains its original findings on reload.
- Back preserves rule values, selected position and focus. Choose later saves successfully. A second explicit save replaces the single stored review.
- Header home/help, both CTAs, +/- controls, native time control, completeness radios, each timeline item, evidence links, focus choices, save, details disclosure, back, reset and cancellation exercised.
- Semantic buttons/inputs, skip link, visible keyboard outlines, stage heading focus, native modal plus explicit Tab wrap, Escape and return-to-trigger support. Reduced-motion CSS removes animations/transitions; no dedicated screen-reader audit or OS reduced-motion emulation claimed.

## Fidelity ledger

Compared both accepted concepts (`docs/design/*-concept.png`) and latest Chrome renders using view_image. Inspected copy, layout, typography, palette, illustration framing, progress/icon treatment and mobile wrapping.

| Comparison point | Evidence and repair |
|---|---|
| Welcome copy | Exact headline, description, primary/secondary labels and fictional-data label restored to concept. Above-the-fold welcome copy diff: no added or removed lines. |
| Editorial typography | Fraunces serif for brand/headings/actions, DM Sans for technical/body UI. Replaced initial sans brand; strengthened heading weight to match the approved hierarchy. Font fallback remains available. |
| Illustration | Dedicated Image Gen asset derived from accepted art; expanded framing to occupy right half and blend into white, without overlays. Native controls remain HTML. |
| Welcome progress | Replaced initial horizontal label-and-circle rows with centered numbered circles, connecting lines and labels below, matching concept. |
| Review composition | Centered progress, computed headline, open A–D timeline, peach evidence band, left-aligned focus heading, lavender/peach choices with round icon grounds. Replaced initial centered focus heading and plain buttons. |
| Palette and accessibility | White canvas, coral actions, lavender secondary/focus, teal followed state. Welcome coral is slightly darker to keep white large text readable; other primary buttons use dark text for contrast. |
| Mobile | Same content order, vertical timeline, stacked rules/evidence/focus controls. Final 390-wide render shows complete readable text and no horizontal overflow. |

Intentional adaptations required by the approved implementation plan: a completeness toggle and explicit status labels; year/IST labels; disabled-save explanation; Back to my rules; a single consistent compass/header; actual selection states and snapshot completion. These add height to the review compared with the concept; the page scrolls naturally. The final app faithfully carries the approved design system and guided composition with these documented functional adaptations. No known fixable clipping or inert controls remain in the verified viewports; pixel identity is not claimed.

## Limits

Fictional sample only. No live model, arbitrary strategy parsing, broker/account data, trading, backend, central telemetry or participant evaluation. One local saved review per browser; clearing storage removes it. Saving is explicit. No breakout, stop-loss, emotion, weekly-pattern or profitability conclusions. Loading typography requires Google Fonts; layout has system fallbacks. Mobile emulation and desktop Chrome/IAB do not establish coverage for every device/browser.

## Public release check

GitHub Actions run 37598192949 succeeded for b4013e5. Public page returned HTTP 200; browser DOM served the matching `index-DzwUeT5Y.js` production bundle. IAB and Chrome exercised the public guided flow, evidence links and save/completion. `live-welcome.jpg` records the public render. Final desktop/mobile visual artifacts come from Chrome at the previously verified sizes; later viewport changes during the mixed-browser session did not apply reliably, so those later captures are not claimed native-size desktop evidence.

Deployment configuration uses repository base `/trading-copilot-alpha/` and Actions Pages, following https://vite.dev/guide/static-deploy.html#github-pages .

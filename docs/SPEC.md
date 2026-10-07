# Accepted alpha specification — 7 October 2026

English UI; white/coral/lavender editorial design approved by the user. No sidebar, balances, P&L leaderboard or trading rewards. One consistent compass header. Responsive desktop/mobile, keyboard accessible and reduced-motion aware.

Welcome: “Make sense of your trading.” / “A short guided review. Your rules, your trades, one useful next step.” Actions: “Try a sample review” and “Set my rules”. Both lead to explicit rule confirmation; sample starts defaults, custom starts the current draft.

Rules: maximum new positions per IST day (positive integer) and entry cutoff HH:mm, default 3 and 11:00. Partial fills belong to one position. User must explicitly confirm. Custom rules are a hypothetical comparison with sample history, not reconstructed intent.

Session: four fictional positions A–D, clickable timeline and evidence. Default A/B/C enter before 11:00; D enters 11:20, fourth position. Complete and incomplete daily-record modes. Missing daily evidence means count checks unknown. Existing timestamps remain independently checkable.

Next step: computed findings, expandable evidence, choose “Check before entry”, “Keep to my daily limit” or “Choose later”. Save a review snapshot and choice locally; no weekly recurrence inferred from one session. Back preserves choices; reset clears app-specific browser data.

Domain contract: confirmed rule snapshot; positions containing execution fills and known/unknown entry evidence; session completeness; per-position per-rule findings (followed/deviated/insufficient evidence), explanation, rule reference, source IDs and calculation. Summaries must use these findings, not hard-coded fixture claims.

Count unique position IDs by first entry, grouped by IST day. First 3 follow a limit of 3; fourth deviates. Entry at 11:00 is not before 11:00. Timestamp parsing requires an explicit offset. Missing earliest-entry coverage prevents entry-time inference from later fills. Historical saved snapshots remain immutable when editing current rules.

Release checks: partial fills, cutoff equality, missing timestamps, incomplete records, parameter changes, snapshot immutability, local storage denied/corrupt, reset/reload/back, desktop/mobile no overflow. Tests/build and browser walkthrough required; publish public repository and GitHub Pages. Supervisor message is draft only.

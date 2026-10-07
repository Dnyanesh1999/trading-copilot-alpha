# Accepted alpha specification — revised 7 October 2026

The user requested a richer, more realistic static alpha while preserving the smooth flow. This revision adds three evidence-based plan checks to the initial two-rule release. It is a user-requested enhancement, not a new supervisor approval.

English UI; approved white/coral/lavender editorial design, welcoming illustration and consistent compass header. No broker-style sidebar, balance dashboard, P&L leaderboard or trading rewards. Desktop/mobile, keyboard access and reduced-motion support remain required.

Welcome → explicitly confirm rules → explore one fictional equity session → save one useful next focus. Both welcome actions lead to confirmation. Fresh sample uses defaults; Set my rules preserves the current draft.

## Confirmed rules

Two visible entry controls: maximum 3 unique new positions per IST day; entry strictly before 11:00 IST. Partial fills count once. Three additional checks are enabled by default, with settings under the Risk plan disclosure:

1. A valid stop plan was recorded strictly before first entry.
2. Initial planned price risk is at most ₹500 per position.
3. Original planned reward-to-risk is at least 2R.

The user may change risk/ratio thresholds or disable the three additional checks together. Changed parameters are a hypothetical comparison against sample history. A recorded stop plan does not establish a broker protective order or actual stop execution.

## Fictional evidence

Invented instruments, companies, prices, quantities and execution timestamps; no actual historical market data. Four positions A–D, including a long with partial fills, a short with a late stop record, a losing trade with all checked rules followed, and a profitable trade crossing four limits. A/B/C enter before 11:00; D is fourth at 11:20.

Full execution record, missing daily records and missing D risk-plan examples. Daily gaps make counts unknown; available entry timestamps and plan records remain independently checkable. A missing/late stop cannot establish the original risk or reward-to-risk. A missing/late target prevents the ratio check without invalidating an independently evidenced stop/risk.

Initial planned risk = complete initial filled quantity × distance from weighted filled entry to a verified pre-entry stop. Direction must be explicit; long and short distances are mirrored. Risk is expressed to the nearest paise. Stop must be on the loss side; target on the reward side. These planned price distances exclude fees, slippage and gaps and are not guarantees. Reward-to-risk compares unrounded distances with a small floating-point equality tolerance; displayed ratios are rounded.

Gross closed-position result is separately computed only when initial and exit coverage are known, exits balance the entry quantity, prices/quantities/timestamps are valid and exits follow the entry fills. It uses fill prices and excludes fees. Outcome is never used to assign rule adherence. No breakout, actual stop-loss discipline, emotions, weekly patterns or profitability-improvement inference.

## Contract and interactions

Confirmed rule snapshot; directional positions with entry/exit execution records, explicit fill coverage and optional timestamped stop/target plan levels; session completeness; per-rule findings with followed/deviated/insufficient evidence, rule reference, source IDs, explanation and calculation. Narratives derive from actual findings. Count by unique position identity and IST day; cutoff equality violates “before.” Offset-aware timestamps required; missing first-entry coverage prevents inference from later fills.

A selected position shows its fills, plan, risk, ratio, outcome and rule checks. Expandable evidence links highlight execution and plan source rows. Focus choices: check before entry, keep to daily limit, check my risk plan (when enabled), choose later. Explicit save stores one immutable review, selected position and focus per browser. Reload restores its actual session, not regenerated fixtures. Old two-rule saves remain compatible. Back preserves drafts/selections; reset clears only app-specific data.

## Release checks

Meaningful tests for legacy rules, partial fills, cutoff/stop equality, IST timestamps, missing coverage/plans, late target, invalid values, long/short calculations, risk/ratio boundaries, result/adherence separation, changed rules, saved snapshots and storage failures. Build and full desktop/mobile browser walkthrough required. Public GitHub repository and Pages; supervisor submission remains a draft for the user to send. Professor reviews the alpha before trader testing; evaluation metrics remain to be agreed.

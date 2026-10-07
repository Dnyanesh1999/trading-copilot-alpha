# Claude — independent audit brief

Repository: https://github.com/Dnyanesh1999/trading-copilot-alpha . Read AGENTS.md, docs/SPEC.md and docs/STATUS.md. Review latest main and record its commit SHA.

Include pre-entry plan timing, mirrored long/short risk calculations, risk/ratio equality, missing plans, outcome/adherence separation and restoring the actual saved session in your audit.

Task: independently audit rule correctness and user flow. Prioritise incomplete-data false adherence, partial-fill grouping, explicit-offset timestamp parsing, cutoff equality, narrative/evidence consistency, hypothetical rules and immutable saved snapshots. Assess whether a first-time trader can complete the flow without explanation. Do not rewrite app code or count AI agreement as validation. Put reproducible findings with priority, input, actual/expected behaviour and source reference in docs/reviews/YYYY-MM-DD_claude.md on branch codex/claude-review. Clearly distinguish confirmed defects from suggestions. Return review commit/PR to Codex; no merge/deployment.

Shared current app baseline: 15d26a6 (richer five-check revision). Read docs/REVIEW_BASELINE.md for branch/file ownership. The alpha UI now exists; review/refine its actual behavior against the accepted concepts. Keep recommendations separate until Codex integration review.

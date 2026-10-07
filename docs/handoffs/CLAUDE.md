# Claude — independent audit brief

Repository: https://github.com/Dnyanesh1999/trading-copilot-alpha . Read AGENTS.md, docs/SPEC.md and docs/STATUS.md. Review latest main and record its commit SHA.

Task: independently audit rule correctness and user flow. Prioritise incomplete-data false adherence, partial-fill grouping, explicit-offset timestamp parsing, cutoff equality, narrative/evidence consistency, hypothetical rules and immutable saved snapshots. Assess whether a first-time trader can complete the flow without explanation. Do not rewrite app code or count AI agreement as validation. Put reproducible findings with priority, input, actual/expected behaviour and source reference in docs/reviews/YYYY-MM-DD_claude.md on branch codex/claude-review. Clearly distinguish confirmed defects from suggestions. Return review commit/PR to Codex; no merge/deployment.

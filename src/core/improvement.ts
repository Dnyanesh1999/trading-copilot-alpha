import type { Finding, Review, RuleId } from "./types";
import { needsReview, planMetrics, rupees } from "./review";
export interface Improvement {
  id: string;
  title: string;
  reason: string;
  steps: string[];
  findings: Finding[];
  kind: "deviation" | "reported" | "evidence" | "maintain";
}
const order: RuleId[] = [
  "stop-before-entry",
  "planned-risk",
  "setup-entry",
  "reward-risk",
  "daily-limit",
  "entry-cutoff",
];
const actions: Record<RuleId, { title: string; steps: string[] }> = {
  "stop-before-entry": {
    title: "Record the plan before the entry",
    steps: [
      "Write the initial stop and target, with the recording time, before entering.",
      "Keep the original plan when you later update a stop; review both separately.",
    ],
  },
  "planned-risk": {
    title: "Check size against your risk cap",
    steps: [
      "Calculate quantity × distance between entry and planned stop.",
      "Compare that amount with your confirmed cap before submitting the entry.",
    ],
  },
  "setup-entry": {
    title: "Wait for your setup confirmation",
    steps: [
      "Record the completed signal candle and the reference level or moving average.",
      "Check the documented condition first, then record the later entry time.",
    ],
  },
  "reward-risk": {
    title: "Check the planned reward-to-risk",
    steps: [
      "Record the original stop and target before entry.",
      "Divide planned target distance by stop distance and compare with your minimum.",
    ],
  },
  "daily-limit": {
    title: "Count new positions before another entry",
    steps: [
      "Check the complete entry record for the IST day; count each new position once.",
      "Compare the count with your chosen daily allowance.",
    ],
  },
  "entry-cutoff": {
    title: "Check the clock before entering",
    steps: [
      "Use the IST timestamp of the first entry.",
      "Compare it with your confirmed cutoff; equal to the cutoff is too late.",
    ],
  },
};
/** Priorities describe documented process gaps, never profitability or inferred behaviour. */
export function improvementsFor(review: Review): Improvement[] {
  const result: Improvement[] = [];
  for (const ruleId of order) {
    const findings = review.findings.filter(
      (f) => f.ruleId === ruleId && f.status === "deviated",
    );
    if (findings.length) {
      const count = new Set(findings.map((f) => f.positionId)).size;
      const position = review.session.positions.find(
        (p) => p.id === findings[0].positionId,
      );
      let steps = [...actions[ruleId].steps];
      if (ruleId === "planned-risk" && position) {
        const m = planMetrics(position);
        const cap = review.rules.checks?.maxRisk;
        if (m.stopDistance && cap && m.risk !== null) {
          steps = [
            `For ${position.instrument}: ${m.quantity} units × ${rupees(m.stopDistance)} = ${rupees(m.risk)} planned risk. At this same distance, your ${rupees(cap)} cap allows at most ${Math.floor(cap / m.stopDistance)} whole units before fees and gaps.`,
            actions[ruleId].steps[1],
          ];
        }
      }
      result.push({
        id: ruleId,
        title: actions[ruleId].title,
        reason: `${count} ${count === 1 ? "position has" : "positions have"} a documented deviation. ${findings[0].label}.`,
        steps,
        findings,
        kind: "deviation",
      });
    }
  }
  const reported = review.findings.filter(needsReview);
  if (reported.length)
    result.push({
      id: "reported-plan",
      title: "Check the reported risk and target",
      reason: `${reported.map((f) => f.label).join("; ")}. These figures come from a supplied plan whose original entry-time state is unverified.`,
      steps: [
        "Check when the original stop and target were recorded; keep later changes separate.",
        "Before your next entry, compare planned risk and reward-to-risk with your confirmed limits.",
      ],
      findings: reported,
      kind: "reported",
    });
  const missing = review.findings.filter(
    (f) => f.status === "insufficient_evidence" && !needsReview(f),
  );
  if (missing.length)
    result.push({
      id: "evidence",
      title: "Fill the evidence gaps",
      reason: `${missing.length} checks could not be verified. This means unknown, not a rule violation.`,
      steps: [
        "Keep the original plan and signal timestamps alongside the trade record.",
        "Add only information you can substantiate; leave the rest unknown.",
      ],
      findings: missing,
      kind: "evidence",
    });
  if (!result.length)
    result.push({
      id: "maintain",
      title: "Keep the checklist for your next review",
      reason:
        "The supplied evidence follows every selected check. A profit or loss does not change that conclusion.",
      steps: [
        "Keep recording the same entry, plan and signal evidence.",
        "Review the next session against the same confirmed rules before deciding what to change.",
      ],
      findings: [],
      kind: "maintain",
    });
  return result.slice(0, 3);
}

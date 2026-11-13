import type { Finding, Review, RuleId, Position } from "./types";
import {
  entryInfo,
  planMetrics,
  reportedPlanMetrics,
  rupees,
  timestampInfo,
} from "./review";
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
const titles: Record<RuleId, string> = {
  "stop-before-entry": "Record the stop before entry",
  "planned-risk": "Check size against your risk cap",
  "setup-entry": "Wait for your setup confirmation",
  "reward-risk": "Check reward-to-risk (R)",
  "daily-limit": "Keep to your daily position limit",
  "entry-cutoff": "Check your entry cutoff",
};
const ordinal = (n: number) =>
  `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th")}`;
const number = (n: number) => Number(n.toFixed(2)).toString();
function specific(
  f: Finding,
  p: Position,
  review: Review,
): Pick<Improvement, "reason" | "steps"> {
  const m = planMetrics(p),
    entry = entryInfo(p);
  let reason = `${p.instrument}: ${f.label}. ${f.calculation}.`;
  let before =
    "Keep the original plan and entry records together; add only details you can verify.";
  let next = `Check ${p.instrument}'s supporting records against the same confirmed rule.`;
  switch (f.ruleId) {
    case "planned-risk": {
      const cap = review.rules.checks?.maxRisk;
      if (m.stopDistance && cap && m.risk !== null)
        before = `For ${p.instrument}: ${m.quantity} units × ${rupees(m.stopDistance)} = ${rupees(m.risk)} planned risk. At this same distance, your ${rupees(cap)} cap allows at most ${Math.floor(cap / m.stopDistance)} whole units before fees and gaps.`;
      next =
        "Compare the next trade's recorded size and planned risk with your confirmed cap.";
      break;
    }
    case "reward-risk": {
      const min = review.rules.checks?.minRewardRisk;
      if (
        min &&
        m.entryPrice !== null &&
        m.stopDistance &&
        m.targetDistance !== null &&
        m.rewardRisk !== null
      ) {
        const sign = p.direction === "short" ? -1 : 1;
        // Round towards satisfying the rule, not away from it.
        const target =
          sign > 0
            ? Math.ceil((m.entryPrice + min * m.stopDistance) * 100) / 100
            : Math.floor((m.entryPrice - min * m.stopDistance) * 100) / 100;
        const stop =
          sign > 0
            ? Math.ceil((m.entryPrice - m.targetDistance / min) * 100) / 100
            : Math.floor((m.entryPrice + m.targetDistance / min) * 100) / 100;
        reason = `${p.instrument}: ${rupees(m.targetDistance)} reward for ${rupees(m.stopDistance)} risk = ${m.rewardRisk.toFixed(1)}R. You need ${number(min)}R.`;
        before = `For ${number(min)}R at this stop, the target would need to be ${rupees(target)} or ${sign > 0 ? "more" : "less"}${target <= 0 ? " (not a valid positive price)" : ""}, or the stop ${rupees(stop)} with the same target. These are checklist calculations; choose levels that fit your strategy before entry.`;
      }
      next =
        "Check the next trade's original stop and target against your minimum R.";
      break;
    }
    case "stop-before-entry": {
      const stop = timestampInfo(p.stop?.recordedAt ?? null);
      if (entry && stop)
        reason = `${p.instrument}: stop recorded at ${stop.clock} IST, entry at ${entry.clock} IST — ${number((stop.epoch - entry.epoch) / 60000)} minutes after entry.`;
      before = `For your next trade, record the initial stop and its time before entering; keep later changes separate.`;
      next =
        "Compare the original stop recording time with the first entry time.";
      break;
    }
    case "daily-limit": {
      if (entry) {
        const day = review.session.positions
          .map((position) => ({ position, time: entryInfo(position) }))
          .filter((item) => item.time?.day === entry.day)
          .sort((a, b) => a.time!.epoch - b.time!.epoch);
        const rank = day.filter(
          (item) => item.time!.epoch <= entry.epoch,
        ).length;
        const last = day[review.rules.maxPositions - 1];
        const date = new Date(`${entry.day}T00:00:00Z`).toLocaleDateString(
          "en-GB",
          { day: "numeric", month: "short", timeZone: "UTC" },
        );
        const tied =
          day.filter((item) => item.time!.epoch === entry.epoch).length > 1;
        reason = `${p.instrument}${tied ? ` brought the recorded count to ${rank} new trades` : ` was your ${ordinal(rank)} new trade`} on ${date}; your limit is ${review.rules.maxPositions}.${last ? ` The ${ordinal(review.rules.maxPositions)} recorded entry was ${last.position.instrument} at ${last.time!.clock} IST${tied ? " (simultaneous entries have no proven order)" : ""}.` : ""}`;
      }
      before = `Count new positions for the IST day before entering; stop opening new positions when you reach your limit of ${review.rules.maxPositions}.`;
      next =
        "Check the full day's entries, counting partial fills as one position.";
      break;
    }
    case "entry-cutoff": {
      if (entry) {
        const [h, min] = review.rules.cutoff.split(":").map(Number);
        const gap = (entry.seconds - h * 3600 - min * 60) / 60;
        reason = `${p.instrument} entered at ${entry.clock} IST, ${gap === 0 ? "exactly at" : `${number(gap)} minutes after`} your ${review.rules.cutoff} cutoff.`;
      }
      before = `Enter only before ${review.rules.cutoff} IST; an entry at the cutoff is already too late for this rule.`;
      next = "Compare the next trade's first entry time with the same cutoff.";
      break;
    }
    case "setup-entry":
      before = `For your next trade, wait for your confirmed ${review.rules.setup?.label ?? "setup"} condition, then record the signal and later entry.`;
      next =
        "Check the recorded signal against the confirmed setup; do not infer it from the result.";
  }
  return { reason, steps: [before, next] };
}
/** Display guidance only: never changes findings or their verdicts. */
export function improvementsFor(review: Review): Improvement[] {
  const result: Improvement[] = [];
  for (const ruleId of order) {
    const findings = review.findings.filter(
      (f) => f.ruleId === ruleId && f.status === "deviated",
    );
    findings.forEach((f, i) => {
      const p = review.session.positions.find((p) => p.id === f.positionId)!;
      result.push({
        id: i ? `${ruleId}:${p.id}` : ruleId,
        title: titles[ruleId],
        ...specific(f, p, review),
        findings: [f],
        kind: "deviation",
      });
    });
  }
  for (const p of review.session.positions) {
    const unresolved = review.findings.filter(
      (f) => f.positionId === p.id && f.status === "insufficient_evidence",
    );
    const reported = unresolved.filter((f) => f.reportedComparison);
    if (reported.length) {
      const m = reportedPlanMetrics(p);
      result.push({
        id: `reported-plan:${p.id}`,
        title: `${p.instrument}: check the reported plan`,
        reason: `${p.instrument}: ${reported.map((f) => f.label).join("; ")}. ${reported.some((f) => f.ruleId === "reward-risk") ? m.rewardBasisText : m.basisText}`,
        steps: [
          "Record your next trade’s original stop and target before entry; compare them with your confirmed limits.",
          "Check the original recording times; reported figures do not prove an entry-time rule break.",
        ],
        findings: reported,
        kind: "reported",
      });
    }
    const missing = unresolved.filter((f) => !f.reportedComparison);
    if (missing.length)
      result.push({
        id: `evidence:${p.id}`,
        title: `${p.instrument}: fill the record gaps`,
        reason: `${p.instrument}: ${missing.map((f) => `${f.label}. ${f.explanation}`).join(" ")} Missing evidence means unknown, not a rule violation.`,
        steps: [
          "Keep your next trade’s original plan, entry and required signal records; add only missing details you can verify.",
          "Check the missing records again; leave anything unverified as unknown.",
        ],
        findings: missing,
        kind: "evidence",
      });
  }
  if (!result.length)
    result.push({
      id: "maintain",
      title: "Keep the checklist for your next review",
      reason:
        "Every assessed check was followed. Checks marked Not checked were not assessed; a profit or loss does not change the result.",
      steps: [
        "Keep recording the same entry and plan information.",
        "Review the next session against the same confirmed rules before deciding what to change.",
      ],
      findings: [],
      kind: "maintain",
    });
  return result;
}

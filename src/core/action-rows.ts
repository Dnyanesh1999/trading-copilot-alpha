import type { Finding, Review, RuleId } from "./types";
import {
  entryInfo,
  needsReview,
  planMetrics,
  rupees,
  timestampInfo,
} from "./review";
import { improvementsFor } from "./improvement";
export type DisplayStatus =
  | "followed"
  | "deviated"
  | "needs-review"
  | "insufficient_evidence"
  | "not_checked";
export interface ActionDetail {
  finding: Finding;
  happened: string;
  emphasis?: string;
  before: string;
}
export interface ActionRow {
  id: string;
  title: string;
  status: DisplayStatus;
  details: ActionDetail[];
  next: string;
  legacyTitles: string[];
}
const titles: Record<RuleId, string> = {
  "planned-risk": "Keep size within your risk cap",
  "setup-entry": "Wait for your setup signal",
  "reward-risk": "Plan at least your minimum R",
  "stop-before-entry": "Record your stop before entry",
  "daily-limit": "Stay within your daily limit",
  "entry-cutoff": "Enter before your cutoff",
};
const missing: Record<RuleId, string> = {
  "planned-risk": "Fill missing risk records",
  "setup-entry": "Fill missing signal records",
  "reward-risk": "Fill missing target records",
  "stop-before-entry": "Fill missing stop records",
  "daily-limit": "Complete your daily entry records",
  "entry-cutoff": "Fill missing entry times",
};
const next: Record<RuleId, string> = {
  "planned-risk": "Compare the next trade’s recorded size with your risk cap.",
  "reward-risk": "Check the original stop and target against your minimum R.",
  "setup-entry": "Check the recorded signal against the same confirmed setup.",
  "stop-before-entry":
    "Compare the original stop recording time with the first entry.",
  "daily-limit":
    "Check all entries for the IST day, counting partial fills once.",
  "entry-cutoff": "Compare the first entry time with your cutoff.",
};
/** Presentation only. Every verdict and reported comparison remains engine-owned. */
export function actionRowsFor(review: Review): ActionRow[] {
  const prior = improvementsFor(review);
  const ids: RuleId[] = [
    "stop-before-entry",
    "planned-risk",
    "setup-entry",
    "reward-risk",
    "daily-limit",
    "entry-cutoff",
  ];
  const rows: ActionRow[] = [];
  for (const id of ids) {
    const findings = review.findings.filter(
      (f) =>
        f.ruleId === id &&
        (f.status === "deviated" || f.status === "insufficient_evidence"),
    );
    if (!findings.length) continue;
    const status: DisplayStatus = findings.some((f) => f.status === "deviated")
      ? "deviated"
      : findings.some(needsReview)
        ? "needs-review"
        : "insufficient_evidence";
    const hasReported = findings.some((f) => f.reportedComparison);
    const title =
      status === "deviated"
        ? titles[id]
        : hasReported
          ? `${findings.every((f) => f.comparisonBasis === "late-plan") ? "Check plans written after entry" : "Check reported plans"}${id === "planned-risk" ? " for risk" : " for R"}`
          : missing[id];
    const details = findings.map((f) => {
      const p = review.session.positions.find((p) => p.id === f.positionId)!;
      const m = planMetrics(p),
        entry = entryInfo(p);
      const old = prior.find((item) => item.findings.includes(f));
      let happened = `${p.instrument}: ${f.label.replace(/\.$/, "")}.`;
      let before =
        "For your next trade, record the original plan and entry times; add only details you can verify.";
      let emphasis: string | undefined;
      if (f.status === "insufficient_evidence" && f.reportedComparison) {
        const c = f.reportedComparison;
        const amount =
          c.unit === "INR" ? rupees(c.value) : `${c.value.toFixed(2)}R`;
        const limit = c.unit === "INR" ? rupees(c.limit) : `${c.limit}R`;
        happened = `${p.instrument} has ${amount} reported ${c.unit === "INR" ? "risk" : "reward-to-risk"} against your ${limit} limit, but the original entry-time plan is unverified.`;
        emphasis = amount;
      } else if (f.status === "deviated") {
        if (
          id === "planned-risk" &&
          m.risk !== null &&
          m.stopDistance &&
          review.rules.checks?.maxRisk
        ) {
          const cap = review.rules.checks.maxRisk;
          emphasis = rupees(m.risk - cap);
          happened = `${p.instrument} had ${rupees(m.risk)} planned risk — ${emphasis} over your ${rupees(cap)} cap.`;
          before = `At ${rupees(m.stopDistance)} risk per share, keep your next trade to ${Math.floor(cap / m.stopDistance)} shares or fewer, before fees and gaps.`;
        } else if (id === "reward-risk" && m.rewardRisk !== null) {
          emphasis = `${m.rewardRisk.toFixed(1)}R`;
          happened = `${p.instrument} planned ${emphasis}, below your ${review.rules.checks?.minRewardRisk}R minimum.`;
          before =
            old?.steps[0]?.replace(
              " These are checklist calculations; choose levels that fit your strategy before entry.",
              "",
            ) ?? before;
        } else if (id === "setup-entry") {
          happened = `${p.instrument}'s signal did not match your ${review.rules.setup?.label ?? "confirmed"} setup.`;
          before =
            "For your next trade, wait for the confirmed setup signal and record it before entry.";
        } else if (id === "stop-before-entry") {
          const stop = timestampInfo(p.stop?.recordedAt ?? null);
          if (stop && entry) {
            emphasis = `${Number(((stop.epoch - entry.epoch) / 60000).toFixed(2))} minutes`;
            happened = `${p.instrument}'s stop was recorded ${emphasis} after entry.`;
          } else happened = `${p.instrument} was entered without a stop plan.`;
          before =
            "Record your next trade’s original stop and its time before entering.";
        } else if (id === "daily-limit" || id === "entry-cutoff") {
          happened = (old?.reason ?? happened).replace(". The ", "; the ");
          before = old?.steps[0] ?? before;
        }
      } else if (!hasReported || !f.reportedComparison) {
        const gap =
          id === "stop-before-entry"
            ? "original stop or its recording time"
            : id === "planned-risk"
              ? "original stop, entry quantity or plan timing"
              : id === "reward-risk"
                ? "original stop, target or plan timing"
                : id === "setup-entry"
                  ? "required signal evidence"
                  : id === "daily-limit"
                    ? "complete daily entry history"
                    : "first entry time";
        happened = `${p.instrument}'s ${gap} is missing or unverified.`;
      }
      return { finding: f, happened, emphasis, before };
    });
    rows.push({
      id,
      title,
      status,
      details,
      next: next[id],
      legacyTitles: prior
        .filter((p) => p.findings.some((f) => f.ruleId === id))
        .map((p) => p.title),
    });
  }
  const gaps = rows.flatMap(r=>r.details).filter(d=>d.finding.status === "insufficient_evidence" && !needsReview(d.finding));
  for(const row of rows) row.details=row.details.filter(d=>!gaps.includes(d));
  for(let i=rows.length-1;i>=0;i--) if(!rows[i].details.length) rows.splice(i,1);
  if(gaps.length) {
    const grouped = [...new Set(gaps.map(d=>d.finding.positionId))].map(id=>{
      const items=gaps.filter(d=>d.finding.positionId===id);
      const instrument=review.session.positions.find(p=>p.id===id)!.instrument;
      return {...items[0], happened:`${instrument} has missing or unverified records for ${[...new Set(items.map(d=>d.finding.ruleId.replaceAll("-"," ")))].join(", ")}.`,emphasis:undefined,before:"Record the original stop, target and entry times before your next trade; keep the full entry history."};
    });
    rows.push({id:"missing-records",title:"Fill missing records",status:"insufficient_evidence",details:grouped,next:"Check the missing records; leave anything unverified as unknown.",legacyTitles:[]});
  }
  rows.sort(
    (a, b) =>
      ({
        deviated: 0,
        "needs-review": 1,
        insufficient_evidence: 2,
        followed: 3,
        not_checked: 4,
      })[a.status] -
      {
        deviated: 0,
        "needs-review": 1,
        insufficient_evidence: 2,
        followed: 3,
        not_checked: 4,
      }[b.status],
  );
  return rows.length
    ? rows
    : [
        {
          id: "maintain",
          title: "Keep recording your plan",
          status: "followed",
          details: [],
          next: "Review the next session against the same confirmed rules.",
          legacyTitles: ["Keep the checklist for your next review"],
        },
      ];
}
export function focusRowFor(review: Review, focus: string) {
  return actionRowsFor(review).find(
    (r) => r.title === focus || r.legacyTitles.includes(focus),
  );
}

import type { Position, RuleId } from "./types";
import {
  planMetrics,
  reportedPlanMetrics,
  rupees,
  timestampInfo,
} from "./review";
export const glossary = {
  "planned-risk": {
    label: "Planned risk",
    meaning:
      "The amount your recorded entry size could lose at the original stop, before fees or gaps.",
    example: "A larger position or a more distant stop increases planned risk.",
  },
  "reward-risk": {
    label: "Reward-to-risk (R)",
    meaning:
      "The distance to your target divided by the distance to your stop.",
    example:
      "A target twice as far from entry as the stop gives twice the planned reward for the risk.",
  },
  "stop-before-entry": {
    label: "Stop recorded before entry",
    meaning:
      "Your records show that you wrote down the stop before opening the trade.",
    example:
      "A stop written after the entry cannot prove what you planned before it.",
  },
  "entry-cutoff": {
    label: "Entry cutoff",
    meaning: "The time before which your first entry must happen, in IST.",
    example:
      "Entering exactly at your cutoff is too late for a strictly-before rule.",
  },
  "daily-limit": {
    label: "Daily position limit",
    meaning: "The most new positions your checklist allows in one IST day.",
    example: "Several fills for the same position still count as one position.",
  },
  "average-entry": {
    label: "Average entry",
    meaning:
      "Your entry price averaged across fills, weighted by the quantity in each fill.",
    example: "A larger fill affects the average more than a smaller fill.",
  },
  "broke-rule": {
    label: "Broke rule",
    meaning: "The available records show a confirmed rule was not followed.",
    example: "A recorded entry after your confirmed cutoff breaks that rule.",
  },
  "needs-review": {
    label: "Needs review",
    meaning:
      "A reported plan exceeds a limit, but its original entry-time state is unverified.",
    example:
      "A stop added after entry may show high reported risk without proving the original risk.",
  },
  "not-enough-data": {
    label: "Not enough data",
    meaning:
      "A check cannot be decided because required information is missing or unverified.",
    example:
      "Without an original stop record, initial planned risk remains unknown.",
  },
  "gross-result": {
    label: "Gross result",
    meaning:
      "The closed trade's price gain or loss before fees, slippage and taxes.",
    example: "A profitable trade can still break your rules.",
  },
} as const;
export type Term = keyof typeof glossary;
export const ruleTerm = (id: RuleId): Term | undefined =>
  id === "setup-entry" ? undefined : id;
export function termExample(term: Term, position?: Position): string {
  if (term !== "reward-risk" || !position) return glossary[term].example;
  const initial = planMetrics(position);
  const reported = initial.rewardRisk === null;
  const m = reported ? reportedPlanMetrics(position) : initial;
  return m.rewardRisk === null ||
    m.stopDistance === null ||
    m.targetDistance === null
    ? `${position.instrument}: the original stop, target or complete entry records are missing or unverified, so an R example is unavailable.`
    : `${position.instrument}: ${rupees(m.targetDistance)} reward ÷ ${rupees(m.stopDistance)} risk = ${m.rewardRisk.toFixed(2)}R${reported ? " reported; the original entry-time plan is unverified" : ""}.`;
}
export function recordTime(value: string | null | undefined): string {
  if (!timestampInfo(value ?? null)) return "time not recorded";
  const date = new Date(value!);
  return `${date.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })}, ${date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" })} IST`;
}

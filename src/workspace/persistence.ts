import {
  validateReviewEntry as historyEntry,
  type ReviewEntry,
} from "../core/saved-review";
export type { ReviewEntry } from "../core/saved-review";
import { studyWorkspace } from "../study/client";
import type { ConfirmedRules, Review, RuleId } from "../core/types";
import {
  confirmStrategy,
  defaultStrategy,
  type StrategyDraft,
} from "../core/workspace";
import { reviewSession, RULE_LABELS } from "../core/review";
import { loadReview } from "../core/storage";
export interface Workspace {
  strategy: StrategyDraft;
  confirmed: ConfirmedRules | null;
  history: ReviewEntry[];
}
const KEY = "trading-copilot.workspace.v2";
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, max: number): value is string =>
  typeof value === "string" && value.length <= max;
function draft(value: unknown): StrategyDraft | null {
  if (
    !record(value) ||
    !text(value.name, 80) ||
    !text(value.description, 6000) ||
    !["intraday", "swing"].includes(String(value.style)) ||
    (value.setup !== undefined &&
      (!record(value.setup) ||
        !["breakout", "ma-reclaim", "opening-range"].includes(
          String(value.setup.kind),
        ) ||
        !text(value.setup.label, 120))) ||
    typeof value.stopBeforeEntry !== "boolean" ||
    !text(value.cutoff, 5) ||
    (value.cutoff !== "" && !/^([01]\d|2[0-3]):[0-5]\d$/.test(value.cutoff)) ||
    !["maxPositions", "maxRisk", "minRewardRisk"].every(
      (key) => typeof value[key] === "number" && Number.isFinite(value[key]),
    ) ||
    !Array.isArray(value.enabledRules) ||
    value.enabledRules.length > 5 ||
    new Set(value.enabledRules).size !== value.enabledRules.length ||
    !value.enabledRules.every(
      (id) =>
        typeof id === "string" &&
        id !== "setup-entry" &&
        Object.hasOwn(RULE_LABELS, id),
    )
  )
    return null;
  return {
    ...(value.setup
      ? { setup: value.setup as unknown as StrategyDraft["setup"] }
      : {}),
    name: value.name,
    description: value.description,
    style: value.style as StrategyDraft["style"],
    maxPositions: value.maxPositions as number,
    cutoff: value.cutoff,
    stopBeforeEntry: value.stopBeforeEntry,
    maxRisk: value.maxRisk as number,
    minRewardRisk: value.minRewardRisk as number,
    enabledRules: [...value.enabledRules] as RuleId[],
  };
}
function matchingConfirmation(
  value: unknown,
  strategy: StrategyDraft,
): ConfirmedRules | null {
  if (
    !record(value) ||
    !text(value.id, 200) ||
    !value.id ||
    !text(value.confirmedAt, 100) ||
    !Number.isFinite(Date.parse(value.confirmedAt))
  )
    return null;
  try {
    const actual = value as unknown as ConfirmedRules;
    reviewSession(actual, {
      id: "validate",
      date: "",
      recordsComplete: false,
      positions: [],
    });
    const expected = confirmStrategy(strategy);
    if (
      JSON.stringify(actual.setup) !== JSON.stringify(expected.setup) ||
      actual.maxPositions !== expected.maxPositions ||
      actual.cutoff !== expected.cutoff ||
      actual.timezone !== expected.timezone ||
      actual.comparison !== expected.comparison ||
      JSON.stringify(actual.enabledRules?.slice().sort()) !==
        JSON.stringify(expected.enabledRules?.slice().sort()) ||
      actual.checks?.stopBeforeEntry !== expected.checks?.stopBeforeEntry ||
      actual.checks?.maxRisk !== expected.checks?.maxRisk ||
      actual.checks?.minRewardRisk !== expected.checks?.minRewardRisk
    )
      return null;
    return structuredClone(actual);
  } catch {
    return null;
  }
}
export function readWorkspace(): Workspace | null {
  try {
    const scope = studyWorkspace();
    const raw = (scope?.store ?? localStorage).getItem(scope?.key ?? KEY);
    if (raw === null) {
      if (scope) return null;
      const legacy = loadReview(localStorage);
      if (!legacy) return null;
      const labels = {
        "entry-check": "Review my entry boundaries",
        "daily-limit": "Review my daily position limit",
        "risk-plan": "Review my risk plan",
        later: "Decide after another review",
      };
      const migrated: Workspace = {
        strategy: structuredClone(defaultStrategy),
        confirmed: null,
        history: [
          {
            id: `legacy-${legacy.savedAt}`,
            name: "Legacy saved review",
            savedAt: legacy.savedAt,
            source: "sample",
            strategyName: "Saved alpha rules",
            focus: labels[legacy.focus],
            review: legacy.review,
          },
        ],
      };
      try {
        writeWorkspace(migrated);
      } catch {
        /* Restore remains usable when writes are denied. */
      }
      return migrated;
    }
    const data: unknown = JSON.parse(raw);
    if (!record(data) || !Array.isArray(data.history)) return null;
    const strategy = draft(data.strategy);
    if (!strategy) return null;
    const history = data.history
      .slice(0, 50)
      .map(historyEntry)
      .filter((entry): entry is ReviewEntry => entry !== null);
    return {
      strategy,
      confirmed: matchingConfirmation(data.confirmed, strategy),
      history,
    };
  } catch {
    return null;
  }
}
export function writeWorkspace(data: Workspace) {
  const scope = studyWorkspace();
  (scope?.store ?? localStorage).setItem(
    scope?.key ?? KEY,
    JSON.stringify(data),
  );
}
export function downloadJson(name: string, value: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

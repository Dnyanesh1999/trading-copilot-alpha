import type { ConfirmedRules, Review, RuleId } from "../core/types";
import {
  confirmStrategy,
  defaultStrategy,
  type StrategyDraft,
} from "../core/workspace";
import { reviewSession, RULE_LABELS } from "../core/review";
import { loadReview } from "../core/storage";
export interface ReviewEntry {
  id: string;
  name: string;
  savedAt: string;
  source: "sample" | "manual" | "csv";
  strategyName: string;
  focus: string;
  review: Review;
}
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
function historyEntry(value: unknown): ReviewEntry | null {
  if (
    !record(value) ||
    !text(value.id, 200) ||
    !value.id ||
    !text(value.name, 200) ||
    !text(value.strategyName, 200) ||
    !text(value.focus, 500) ||
    !text(value.savedAt, 100) ||
    !Number.isFinite(Date.parse(value.savedAt)) ||
    !["sample", "manual", "csv"].includes(String(value.source)) ||
    !record(value.review) ||
    !record(value.review.session) ||
    !Array.isArray(value.review.session.positions) ||
    !value.review.session.positions.length ||
    value.review.session.positions.length > 200 ||
    typeof value.review.session.recordsComplete !== "boolean" ||
    !text(value.review.session.date, 100)
  )
    return null;
  const session = value.review.session;
  if (
    session.dataSource !== undefined &&
    session.dataSource !== "fictional" &&
    session.dataSource !== "user-supplied"
  )
    return null;
  const signal = (item: unknown) =>
    item == null ||
    (record(item) &&
      ["at", "rangeEnd"].every((k) => item[k] === null || text(item[k], 100)) &&
      ["close", "reference", "previousClose", "previousReference"].every(
        (k) =>
          item[k] === null ||
          (typeof item[k] === "number" && Number.isFinite(item[k])),
      ));
  const plan = (level: unknown) =>
    level == null ||
    (record(level) &&
      text(level.id, 200) &&
      typeof level.price === "number" &&
      Number.isFinite(level.price) &&
      (level.recordedAt === null || text(level.recordedAt, 100)));
  if (
    !record(value.review.rules) ||
    !text(value.review.rules.id, 200) ||
    !text(value.review.rules.confirmedAt, 100) ||
    !Number.isFinite(Date.parse(value.review.rules.confirmedAt))
  )
    return null;
  if (
    !(session.positions as unknown[]).every(
      (position) =>
        record(position) &&
        text(position.id, 200) &&
        text(position.instrument, 200) &&
        signal(position.signal) &&
        plan(position.stop) &&
        plan(position.target) &&
        (position.direction === undefined ||
          ["long", "short"].includes(String(position.direction))) &&
        typeof position.firstEntryCovered === "boolean" &&
        Array.isArray(position.executions) &&
        position.executions.length <= 1000 &&
        position.executions.every(
          (execution) =>
            record(execution) &&
            text(execution.id, 200) &&
            ["entry", "exit"].includes(String(execution.side)) &&
            (execution.timestamp === null || text(execution.timestamp, 100)) &&
            typeof execution.price === "number" &&
            Number.isFinite(execution.price) &&
            typeof execution.quantity === "number" &&
            Number.isFinite(execution.quantity),
        ),
    )
  )
    return null;
  try {
    const computed = reviewSession(
      value.review.rules as unknown as ConfirmedRules,
      session as unknown as Review["session"],
    );
    return {
      id: value.id,
      name: value.name,
      savedAt: value.savedAt,
      source: value.source as ReviewEntry["source"],
      strategyName: value.strategyName,
      focus: value.focus,
      review: computed,
    };
  } catch {
    return null;
  }
}
export function readWorkspace(): Workspace | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) {
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
  localStorage.setItem(KEY, JSON.stringify(data));
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

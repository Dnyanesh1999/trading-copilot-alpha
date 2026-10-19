import type { ConfirmedRules, Review } from "./types";
import { reviewSession } from "./review";
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, max: number): value is string =>
  typeof value === "string" && value.length <= max;
export interface ReviewEntry {
  id: string;
  name: string;
  savedAt: string;
  source: "sample" | "manual" | "csv";
  strategyName: string;
  focus: string;
  review: Review;
}
export function validateReviewEntry(value: unknown): ReviewEntry | null {
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

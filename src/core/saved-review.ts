import { isDemoReplay, DEMO_NOTICE } from "./demo-label";
import type { ConfirmedRules, DailyBar, Review } from "./types";
import {
  isSessionDate,
  LOOKBACK,
  replayCoverage,
  replayWeekendDates,
} from "./historical-replay";
import { verifyReplayHash } from "./replay-evidence";
import {
  reviewSession,
  REVIEW_LOGIC_VERSION,
  reviewCounts,
  timestampInfo,
} from "./review";
import { stopDeclarations } from "./stop-record";
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, max: number): value is string =>
  typeof value === "string" && value.length <= max;
export interface ReviewEntry {
  reviewLogicVersion?: number;
  recomputed?: boolean;
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
  if (session.historicalReplay !== undefined) {
    const replay = session.historicalReplay;
    if (
      value.source !== "csv" ||
      session.dataSource !== "user-supplied" ||
      !record(replay) ||
      (replay.priceSource !== undefined && replay.priceSource !== "dhan") ||
      ![replay.lookbackStart, replay.lookbackEnd, replay.resistanceDate].every(
        (date) => typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date),
      )
    )
      return null;
    // Old replay reviews have no series and remain readable.
    if (replay.series !== undefined) {
      const series = replay.series;
      if (
        !record(series) ||
        !Object.keys(series).every((key) =>
          ["source", "fetchedAt", "fileName", "bars", "sha256"].includes(key),
        ) ||
        (series.source !== "csv" && series.source !== "dhan") ||
        (series.source === "dhan") !== (replay.priceSource === "dhan") ||
        !text(series.fetchedAt, 100) ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(
          series.fetchedAt,
        ) ||
        !isSessionDate(series.fetchedAt.slice(0, 10)) ||
        !Number.isFinite(Date.parse(series.fetchedAt)) ||
        (series.fileName !== undefined &&
          (!text(series.fileName, 255) || !series.fileName)) ||
        !text(series.sha256, 64) ||
        !/^[a-f0-9]{64}$/.test(series.sha256) ||
        !Array.isArray(series.bars) ||
        series.bars.length !== LOOKBACK + 2 ||
        !series.bars.every(
          (bar) =>
            record(bar) &&
            Object.keys(bar).every((key) =>
              ["date", "open", "high", "low", "close", "volume"].includes(key),
            ) &&
            typeof bar.date === "string" &&
            isSessionDate(bar.date) &&
            [bar.open, bar.high, bar.low, bar.close].every(
              (price) => typeof price === "number",
            ) &&
            (bar.volume === undefined || typeof bar.volume === "number"),
        )
      )
        return null;
      const bars = series.bars as DailyBar[];
      const weekendDates = replayWeekendDates(bars);
      try {
        if (
          replay.maxGapDays !== replayCoverage(bars) ||
          // Pre-Step-2 snapshots omitted the field and could contain no weekends.
          (replay.weekendDates === undefined
            ? weekendDates.length !== 0
            : JSON.stringify(replay.weekendDates) !==
              JSON.stringify(weekendDates)) ||
          !verifyReplayHash(bars, series.sha256) ||
          replay.lookbackStart !== bars[0].date ||
          replay.lookbackEnd !== bars[LOOKBACK - 1].date ||
          replay.resistanceDate !==
            bars
              .slice(0, LOOKBACK)
              .reduce((highest, bar) =>
                bar.high > highest.high ? bar : highest,
              ).date ||
          session.date !== bars[LOOKBACK + 1].date
        )
          return null;
      } catch {
        return null;
      }
    }
  }
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
        (position.stopDeclaration === undefined ||
          stopDeclarations.includes(
            position.stopDeclaration as NonNullable<
              Review["session"]["positions"][number]["stopDeclaration"]
            >,
          )) &&
        (position.stopDeclaration !== "had-stop" || position.stop != null) &&
        (!(
          position.stopDeclaration === "no-stop" ||
          position.stopDeclaration === "not-recorded"
        ) ||
          position.stop == null) &&
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
    const replay =
      session.historicalReplay as Review["session"]["historicalReplay"];
    if (replay?.series) {
      const positions = session.positions as Review["session"]["positions"];
      const position = positions[0];
      const bars = replay.series.bars;
      const reference = Math.max(
        ...bars.slice(0, LOOKBACK).map((bar) => bar.high),
      );
      if (
        positions.length !== 1 ||
        position.signal?.close !== bars[LOOKBACK].close ||
        position.signal?.reference !== reference ||
        timestampInfo(position.signal?.at ?? null)?.day !==
          bars[LOOKBACK].date ||
        position.executions.length !== 1 ||
        position.executions[0].side !== "entry" ||
        position.executions[0].price !== bars[LOOKBACK + 1].open ||
        timestampInfo(position.executions[0].timestamp)?.day !==
          bars[LOOKBACK + 1].date
      )
        return null;
    }
    const computed = reviewSession(
      value.review.rules as unknown as ConfirmedRules,
      session as unknown as Review["session"],
      value.source as ReviewEntry["source"],
    );
    return {
      id: value.id,
      name: value.name,
      savedAt: value.savedAt,
      source: value.source as ReviewEntry["source"],
      strategyName: value.strategyName,
      focus: value.focus,
      reviewLogicVersion:
        typeof value.reviewLogicVersion === "number"
          ? value.reviewLogicVersion
          : 1,
      recomputed: value.reviewLogicVersion !== REVIEW_LOGIC_VERSION,
      review: computed,
    };
  } catch {
    return null;
  }
}
export function exportReview(entry: ReviewEntry) {
  return {
    ...entry,
    ...(isDemoReplay(entry.review.session) ? { dataNotice: DEMO_NOTICE } : {}),
    evaluatedWithLogicVersion: REVIEW_LOGIC_VERSION,
    summary: reviewCounts(entry.review),
  };
}

import { describe, expect, it } from "vitest";
import { createRules } from "./fixtures";
import {
  needsReview,
  reviewCounts,
  reviewSession,
  REVIEW_LOGIC_VERSION,
} from "./review";
import { exportReview, validateReviewEntry } from "./saved-review";
import {
  defaultTrade,
  correctStopRecord,
  tradesToSession,
  TradeInputError,
} from "./workspace";
import { parseTradeCsv, sessionToCsv } from "./trade-csv";
import { improvementsFor } from "./improvement";
import type { Position, Session } from "./types";

const at = (clock: string) => `2026-10-16T${clock}:00+05:30`;
const rules = () =>
  createRules(10, "16:00", {
    stopBeforeEntry: true,
    maxRisk: 800,
    minRewardRisk: 2,
  });
function position(
  id: string,
  price: number,
  quantity: number,
  stop: number | null,
  target: number | null,
  stopTime: string | null,
  declaration?: Position["stopDeclaration"],
): Position {
  return {
    id,
    instrument: id,
    direction: "long",
    firstEntryCovered: true,
    allEntriesCovered: true,
    executionsComplete: false,
    stopDeclaration: declaration,
    executions: [
      {
        id: `${id}-entry`,
        side: "entry",
        price,
        quantity,
        timestamp: at("09:20"),
      },
    ],
    stop:
      stop === null
        ? null
        : { id: `${id}-stop`, price: stop, recordedAt: stopTime },
    target:
      target === null
        ? null
        : { id: `${id}-target`, price: target, recordedAt: stopTime },
  };
}
const session = (positions: Position[]): Session => ({
  id: "fictional-stage1",
  date: "2026-10-16",
  dataSource: "fictional",
  recordsComplete: true,
  positions,
});
const finding = (
  review: ReturnType<typeof reviewSession>,
  instrument: string,
  ruleId: string,
) =>
  review.findings.find(
    (f) => f.positionId === instrument && f.ruleId === ruleId,
  )!;

describe("Stage 1 fictional four-trade audit regression", () => {
  it("separates confirmed no-stop, unknown record, and late-plan reported amounts", () => {
    const review = reviewSession(
      rules(),
      session([
        position("TCS", 100, 10, 95, 110, at("09:10"), "had-stop"),
        position("INFY", 1500, 20, 1440, 1560, at("09:25"), "had-stop"),
        position("HDFCBANK", 100, 10, null, 120, null, "no-stop"),
        position("RELIANCE", 2800, 1, null, null, null),
      ]),
    );
    expect(
      review.findings
        .filter((f) => f.positionId === "TCS")
        .every((f) => f.status === "followed"),
    ).toBe(true);
    expect(finding(review, "INFY", "stop-before-entry").status).toBe(
      "deviated",
    );
    const risk = finding(review, "INFY", "planned-risk");
    expect(risk.status).toBe("insufficient_evidence");
    expect(risk.reportedComparison).toEqual({
      value: 1200,
      limit: 800,
      unit: "INR",
      breached: true,
    });
    expect(risk.label).toContain("1.5× limit");
    expect(risk.explanation).toContain(
      "original entry-time plan is unverified",
    );
    expect(needsReview(risk)).toBe(true);
    expect(
      finding(review, "INFY", "reward-risk").reportedComparison?.value,
    ).toBe(1);
    expect(needsReview(finding(review, "INFY", "reward-risk"))).toBe(true);
    expect(finding(review, "HDFCBANK", "stop-before-entry").status).toBe(
      "deviated",
    );
    expect(finding(review, "RELIANCE", "stop-before-entry").status).toBe(
      "insufficient_evidence",
    );
    expect(reviewCounts(review)).toMatchObject({
      trades: 4,
      noStopRecord: 2,
      noStop: 1,
      unresolvedStopRecords: 1,
      reportedWarnings: 2,
    });
    expect(
      improvementsFor(review).some(
        (p) => p.kind === "reported" && p.findings.length === 2,
      ),
    ).toBe(true);
  });

  it("does not turn a late but within-limit plan green, and computes from prices without an entry clock", () => {
    const p = position("LATE", 100, 10, 95, 110, at("09:25"), "had-stop");
    p.executions[0].timestamp = null;
    const review = reviewSession(rules(), session([p]));
    expect(
      finding(review, "LATE", "planned-risk").reportedComparison?.value,
    ).toBe(50);
    expect(finding(review, "LATE", "planned-risk").status).toBe(
      "insufficient_evidence",
    );
    expect(finding(review, "LATE", "planned-risk").comparisonBasis).toBe(
      "timing-unknown",
    );
    p.executions[0].timestamp = at("09:20");
    const late = reviewSession(rules(), session([p]));
    expect(finding(late, "LATE", "planned-risk").comparisonBasis).toBe(
      "late-plan",
    );
    expect(finding(late, "LATE", "planned-risk").status).toBe(
      "insufficient_evidence",
    );
    expect(needsReview(finding(late, "LATE", "planned-risk"))).toBe(false);
  });

  it("flags legacy invalid initial geometry without treating recorded time as valid compliance", () => {
    const bad = position("RELIANCE", 2800, 1, 2850, 2900, at("09:10"));
    const review = reviewSession(rules(), session([bad]));
    expect(finding(review, "RELIANCE", "stop-before-entry")).toMatchObject({
      status: "insufficient_evidence",
      comparisonBasis: "invalid-record",
      label: "Invalid initial stop",
    });
    expect(finding(review, "RELIANCE", "planned-risk").status).toBe(
      "insufficient_evidence",
    );
  });

  it("requires an explicit manual stop choice, validates long/short levels and keeps entered values", () => {
    const base = {
      ...defaultTrade,
      instrument: "FICTIONAL",
      quantity: "10",
      entryPrice: "100",
      enteredAt: "2026-10-16T09:20",
    };
    expect(() => tradesToSession([base], true)).toThrow(TradeInputError);
    expect(() =>
      tradesToSession(
        [
          {
            ...base,
            stopDeclaration: "had-stop",
            stopPrice: "105",
            planRecordedAt: "2026-10-16T09:10",
          },
        ],
        true,
      ),
    ).toThrow("Initial long stop must be below");
    expect(() =>
      tradesToSession(
        [
          {
            ...base,
            stopDeclaration: "had-stop",
            stopPrice: "95",
            targetPrice: "100",
            planRecordedAt: "2026-10-16T09:10",
          },
        ],
        true,
      ),
    ).toThrow("Initial long target must be above");
    expect(() =>
      tradesToSession(
        [
          {
            ...base,
            direction: "short",
            stopDeclaration: "had-stop",
            stopPrice: "95",
            planRecordedAt: "2026-10-16T09:10",
          },
        ],
        true,
      ),
    ).toThrow("Initial short stop must be above");
    const noStop = tradesToSession(
      [{ ...base, stopDeclaration: "no-stop" }],
      true,
    );
    expect(
      finding(
        reviewSession(rules(), noStop),
        noStop.positions[0].id,
        "stop-before-entry",
      ).status,
    ).toBe("deviated");
    const unknown = tradesToSession(
      [{ ...base, stopDeclaration: "not-recorded" }],
      true,
    );
    expect(
      finding(
        reviewSession(rules(), unknown),
        unknown.positions[0].id,
        "stop-before-entry",
      ).status,
    ).toBe("insufficient_evidence");
  });

  it("corrects a review in memory, then exports identical counts without rewriting legacy date or rules", () => {
    const original = position("HDFCBANK", 100, 10, null, null, null);
    const before = reviewSession(rules(), session([original]));
    const corrected = correctStopRecord(original, "no-stop", "", "", true);
    const after = reviewSession(before.rules, {
      ...before.session,
      positions: [corrected],
    });
    expect(finding(before, "HDFCBANK", "stop-before-entry").status).toBe(
      "insufficient_evidence",
    );
    expect(finding(after, "HDFCBANK", "stop-before-entry").status).toBe(
      "deviated",
    );
    const savedAt = "2026-10-16T11:00:00+05:30";
    const legacy = validateReviewEntry({
      id: "legacy",
      name: "Legacy",
      strategyName: "Plan",
      focus: "",
      source: "manual",
      savedAt,
      review: before,
    });
    expect(legacy).toMatchObject({
      reviewLogicVersion: 1,
      recomputed: true,
      savedAt,
    });
    expect(legacy?.review.rules.id).toBe(before.rules.id);
    const next = {
      ...legacy!,
      review: after,
      reviewLogicVersion: REVIEW_LOGIC_VERSION,
      recomputed: false,
    };
    expect(exportReview(next).summary).toEqual(reviewCounts(after));
    expect(next.savedAt).toBe(savedAt);
  });

  it("rejects wrong initial levels by CSV row and retains legacy CSV without a stop declaration", () => {
    const header =
      "instrument,direction,quantity,entry_price,entry_at,stop_price,target_price,plan_recorded_at";
    expect(() =>
      parseTradeCsv(
        `${header}\nRELIANCE,long,1,2800,${at("09:20")},2850,2900,${at("09:10")}`,
      ),
    ).toThrow("CSV row 2: stop_price");
    expect(() =>
      parseTradeCsv(
        `${header}\nSHORT,short,1,100,${at("09:20")},105,100,${at("09:10")}`,
      ),
    ).toThrow("CSV row 2: target_price");
    const imported = parseTradeCsv(
      `instrument,direction,quantity,entry_price,entry_at\nOLD,long,1,100,${at("09:20")}`,
    );
    expect(imported.session.positions[0].stopDeclaration).toBe("not-recorded");
    expect(
      parseTradeCsv(sessionToCsv(imported.session)).session.positions[0]
        .stopDeclaration,
    ).toBe("not-recorded");
  });
});

import { describe, expect, it } from "vitest";
import { createRules } from "./fixtures";
import { positionStatus, reviewCounts, reviewSession } from "./review";
import { parseTradeCsv, sessionToCsv } from "./trade-csv";
import { defaultTrade, tradesToSession } from "./workspace";
import { validateReviewEntry } from "./saved-review";
import type { ConfirmedRules } from "./types";

const rules = (): ConfirmedRules => ({
  ...createRules(2, "14:30", {
    stopBeforeEntry: true,
    maxRisk: 800,
    minRewardRisk: 2,
  }),
  setup: { kind: "ma-reclaim" as const, label: "20-period MA reclaim" },
  enabledRules: [
    "setup-entry",
    "daily-limit",
    "entry-cutoff",
    "stop-before-entry",
    "planned-risk",
    "reward-risk",
  ],
});

describe("manual trades with a confirmed entry setup", () => {
  const trade = {
    ...defaultTrade,
    instrument: "FICTIONAL-TCS",
    quantity: "10",
    entryPrice: "100",
    enteredAt: "2026-10-20T10:00",
    stopDeclaration: "had-stop" as const,
    stopPrice: "95",
    targetPrice: "110",
    planRecordedAt: "2026-10-20T09:45",
  };

  it("does not count an unavailable manual signal check against a clean trade", () => {
    const session = tradesToSession([trade], true);
    const review = reviewSession(rules(), session, "manual");
    const setup = review.findings.find((f) => f.ruleId === "setup-entry");
    expect(setup).toMatchObject({
      status: "not_checked",
      label: "Not checked (manual entry has no signal data)",
    });
    expect(positionStatus(review, session.positions[0].id)).toBe("followed");
    expect(reviewCounts(review)).toMatchObject({
      tradesNeedingAttention: 0,
      brokenRules: 0,
      notEnoughData: 0,
    });

    const restored = validateReviewEntry({
      id: "fictional-review",
      name: "fictional review",
      savedAt: "2026-10-21T10:00:00+05:30",
      source: "manual",
      strategyName: "MA reclaim",
      focus: "later",
      review,
    });
    expect(
      restored?.review.findings.find((f) => f.ruleId === "setup-entry")?.status,
    ).toBe("not_checked");
    expect(positionStatus(restored!.review, session.positions[0].id)).toBe(
      "followed",
    );
  });

  it("evaluates the same trade normally when CSV supplies the MA signal", () => {
    const session = tradesToSession([trade], true);
    session.positions[0].signal = {
      at: "2026-10-20T09:55:00+05:30",
      close: 101,
      reference: 100,
      previousClose: 99,
      previousReference: 100,
      rangeEnd: null,
    };
    const imported = parseTradeCsv(
      sessionToCsv(session, "user-supplied"),
    ).session;
    imported.recordsComplete = true;
    const review = reviewSession(rules(), imported, "csv");
    expect(
      review.findings.find((f) => f.ruleId === "setup-entry")?.status,
    ).toBe("followed");
    imported.positions[0].signal!.previousClose = 102;
    const mismatched = reviewSession(rules(), imported, "csv");
    expect(
      mismatched.findings.find((f) => f.ruleId === "setup-entry")?.status,
    ).toBe("deviated");
  });
});

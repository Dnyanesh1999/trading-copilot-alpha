import { describe, expect, it } from "vitest";
import {
  confirmStrategy,
  defaultStrategy,
  defaultTrade,
  tradesToSession,
} from "./workspace";
import { positionStatus, reviewSession } from "./review";
import { createRules, realisticSession } from "./fixtures";
const trade = {
  ...defaultTrade,
  instrument: "TEST",
  quantity: "10",
  entryPrice: "100",
  stopPrice: "95",
  targetPrice: "110",
  enteredAt: "2026-10-16T10:00",
  planRecordedAt: "2026-10-16T09:00",
};
describe("strategy workspace", () => {
  it("ignores invalid hidden entry limits when those checks are disabled", () => {
    const rules = confirmStrategy({
      ...defaultStrategy,
      maxPositions: 0,
      cutoff: "",
    });
    expect(rules.enabledRules).toEqual(defaultStrategy.enabledRules);
    expect(
      reviewSession(rules, tradesToSession([trade], true)).findings,
    ).toHaveLength(3);
    expect(() =>
      confirmStrategy({
        ...defaultStrategy,
        maxPositions: 0,
        enabledRules: ["daily-limit"],
      }),
    ).toThrow();
  });
  it("treats overflowing derived metrics as missing evidence", () => {
    const session = tradesToSession(
      [{ ...trade, quantity: "1e200", entryPrice: "1e200" }],
      true,
    );
    const findings = reviewSession(
      confirmStrategy(defaultStrategy),
      session,
    ).findings;
    expect(findings.find((f) => f.ruleId === "planned-risk")?.status).toBe(
      "insufficient_evidence",
    );
    expect(findings.find((f) => f.ruleId === "reward-risk")?.status).toBe(
      "insufficient_evidence",
    );
    const riskOverflow = tradesToSession(
      [{ ...trade, quantity: "1e100", entryPrice: "1e207", stopPrice: "1" }],
      true,
    );
    expect(
      reviewSession(
        confirmStrategy(defaultStrategy),
        riskOverflow,
      ).findings.find((f) => f.ruleId === "planned-risk")?.status,
    ).toBe("insufficient_evidence");
  });
  it("reviews only selected risk rules without adding intraday checks", () => {
    const review = reviewSession(
      confirmStrategy(defaultStrategy),
      tradesToSession([trade], false),
    );
    expect(review.findings.map((f) => f.ruleId)).toEqual(
      defaultStrategy.enabledRules,
    );
    expect(review.findings.every((f) => f.status === "followed")).toBe(true);
  });
  it("rejects no checks, duplicates, unknown rules and disabled selected stop", () => {
    expect(() =>
      confirmStrategy({ ...defaultStrategy, enabledRules: [] }),
    ).toThrow();
    expect(() =>
      confirmStrategy({
        ...defaultStrategy,
        enabledRules: ["planned-risk", "planned-risk"],
      }),
    ).toThrow();
    expect(() =>
      confirmStrategy({
        ...defaultStrategy,
        enabledRules: ["unsupported" as never],
      }),
    ).toThrow();
    expect(() =>
      confirmStrategy({ ...defaultStrategy, stopBeforeEntry: false }),
    ).toThrow();
  });
  it("preserves legacy checks and treats an empty finding set as unknown", () => {
    const review = reviewSession(createRules(3, "11:00"), realisticSession());
    expect(new Set(review.findings.map((f) => f.ruleId))).toEqual(
      new Set(["daily-limit", "entry-cutoff"]),
    );
    expect(positionStatus({ ...review, findings: [] }, "D")).toBe(
      "insufficient_evidence",
    );
  });
  it("never infers pre-entry plan timing", () => {
    const session = tradesToSession([{ ...trade, planRecordedAt: "" }], true);
    expect(session.positions[0].stop?.recordedAt).toBeNull();
    expect(session.positions[0].executions[0].timestamp).toBe(
      "2026-10-16T10:00:00+05:30",
    );
    expect(
      reviewSession(confirmStrategy(defaultStrategy), session).findings.every(
        (f) => f.status === "insufficient_evidence",
      ),
    ).toBe(true);
  });
  it("validates date, quantity and paired exits", () => {
    expect(() =>
      tradesToSession([{ ...trade, enteredAt: "2026-02-30T10:00" }], true),
    ).toThrow();
    expect(() =>
      tradesToSession([{ ...trade, quantity: "0" }], true),
    ).toThrow();
    expect(() =>
      tradesToSession([{ ...trade, exitPrice: "101" }], true),
    ).toThrow();
    expect(() =>
      tradesToSession(
        [{ ...trade, exitPrice: "101", exitedAt: "2026-10-15T10:00" }],
        true,
      ),
    ).toThrow();
    expect(tradesToSession([trade], true).positions[0].executionsComplete).toBe(
      false,
    );
    expect(
      tradesToSession(
        [{ ...trade, exitPrice: "101", exitedAt: "2026-10-17T10:00" }],
        true,
      ).positions[0].executionsComplete,
    ).toBe(true);
  });
});

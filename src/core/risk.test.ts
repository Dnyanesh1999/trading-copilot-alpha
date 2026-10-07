import { describe, expect, it } from "vitest";
import {
  createRules,
  DEFAULT_CHECKS,
  realisticSession,
  sampleSession,
} from "./fixtures";
import {
  reviewSession,
  planMetrics,
  grossResult,
  entryMetrics,
  reviewSummary,
} from "./review";
import { saveReview, loadReview } from "./storage";
import type { Position, RuleId, FindingStatus } from "./types";
const rules = () => createRules(3, "11:00", DEFAULT_CHECKS);
const position = (id: string) =>
  realisticSession().positions.find((p) => p.id === id)!;
const check = (p: Position, ruleId: RuleId) =>
  reviewSession(rules(), {
    ...realisticSession(),
    positions: [p],
  }).findings.find((f) => f.ruleId === ruleId)!;

describe("five evidence-based checks", () => {
  it("derives the full fixture findings and summary", () => {
    const review = reviewSession(rules(), realisticSession());
    expect(review.findings).toHaveLength(20);
    expect(review.findings.filter((f) => f.status === "deviated")).toHaveLength(
      5,
    );
    expect(
      review.findings.filter((f) => f.status === "insufficient_evidence"),
    ).toHaveLength(2);
    expect(reviewSummary(review).title).toBe("2 positions to revisit.");
    const d = review.findings.filter((f) => f.positionId === "D");
    expect(
      d.filter((f) => f.status === "deviated").map((f) => f.ruleId),
    ).toEqual(["daily-limit", "entry-cutoff", "planned-risk", "reward-risk"]);
    expect(d.find((f) => f.ruleId === "planned-risk")?.sourceIds).toEqual([
      "D-entry-01",
      "D-stop",
    ]);
    expect(d.find((f) => f.ruleId === "reward-risk")?.sourceIds).toContain(
      "D-target",
    );
  });
  it("combines partial fills into weighted entry and one risk amount", () => {
    const a = position("A");
    expect(entryMetrics(a)).toEqual({ quantity: 10, price: 1240.8 });
    expect(planMetrics(a).risk).toBe(208);
    expect(planMetrics(a).rewardRisk).toBeCloseTo(2.125);
    expect(grossResult(a)).toBe(442);
  });
  it("keeps result separate from discipline", () => {
    const review = reviewSession(rules(), realisticSession());
    expect(grossResult(position("C"))).toBe(-240);
    expect(
      review.findings
        .filter((f) => f.positionId === "C")
        .every((f) => f.status === "followed"),
    ).toBe(true);
    expect(grossResult(position("D"))).toBe(720);
    expect(
      review.findings.some(
        (f) => f.positionId === "D" && f.status === "deviated",
      ),
    ).toBe(true);
  });
  it("does not treat a late stop as the original risk plan", () => {
    const b = position("B");
    expect(check(b, "stop-before-entry").status).toBe("deviated");
    expect(planMetrics(b).risk).toBeNull();
    expect(planMetrics(b).rewardRisk).toBeNull();
    expect(grossResult(b)).toBe(200);
  });
  it("handles a verified short plan with mirrored price distances", () => {
    const b = position("B");
    b.stop!.recordedAt = "2026-09-23T09:44:00+05:30";
    expect(planMetrics(b).risk).toBe(300);
    expect(planMetrics(b).rewardRisk).toBeCloseTo(35 / 15);
    expect(check(b, "planned-risk").status).toBe("followed");
  });
  it.each(["2026-09-23T10:32:00+05:30", "2026-09-23T10:32:00.001+05:30"])(
    "requires the stop strictly before entry: %s",
    (time) => {
      const c = position("C");
      c.stop!.recordedAt = time;
      expect(check(c, "stop-before-entry").status).toBe("deviated");
      expect(check(c, "planned-risk").status).toBe("insufficient_evidence");
    },
  );
  it("accepts a stop one millisecond before entry", () => {
    const c = position("C");
    c.stop!.recordedAt = "2026-09-23T10:31:59.999+05:30";
    expect(check(c, "stop-before-entry").status).toBe("followed");
  });
  it("uses timestamp epochs across offset representations", () => {
    const c = position("C");
    c.stop!.recordedAt = "2026-09-23T04:55:00Z";
    expect(check(c, "stop-before-entry").status).toBe("followed");
    expect(planMetrics(c).risk).toBe(240);
  });
  it("accepts equality for risk cap and reward-risk minimum", () => {
    const r = createRules(4, "12:00", {
      stopBeforeEntry: true,
      maxRisk: 240,
      minRewardRisk: 2,
    });
    const review = reviewSession(r, {
      ...realisticSession(),
      positions: [position("C")],
    });
    expect(review.findings.every((f) => f.status === "followed")).toBe(true);
  });
  it("does not turn mathematical reward-risk equality into a deviation through floating-point noise", () => {
    const c = position("C");
    c.executions[0].price = 10.3;
    c.stop!.price = 10.2;
    c.target!.price = 10.5;
    expect(planMetrics(c).rewardRisk).toBeCloseTo(2);
    expect(check(c, "reward-risk").status).toBe("followed");
    c.target!.price = 10.49;
    expect(check(c, "reward-risk").status).toBe("deviated");
  });
  it("requires target evidence before entry but still establishes risk from stop", () => {
    const c = position("C");
    c.target!.recordedAt = "2026-09-23T10:33:00+05:30";
    expect(planMetrics(c).risk).toBe(240);
    expect(check(c, "reward-risk").status).toBe("insufficient_evidence");
  });
  it.each([null, "10:25", "2026-02-30T10:25:00+05:30"])(
    "abstains on invalid stop recording time: %s",
    (time) => {
      const c = position("C");
      c.stop!.recordedAt = time;
      expect(check(c, "stop-before-entry").status).toBe(
        "insufficient_evidence",
      );
      expect(planMetrics(c).risk).toBeNull();
    },
  );
  it("abstains on missing plans without losing available entry evidence", () => {
    const review = reviewSession(rules(), realisticSession("plan-gap"));
    const d = review.findings.filter((f) => f.positionId === "D");
    expect(d.map((f) => f.status)).toEqual([
      "deviated",
      "deviated",
      "insufficient_evidence",
      "insufficient_evidence",
      "insufficient_evidence",
    ]);
  });
  it("daily gaps do not erase independent risk-plan evidence", () => {
    const review = reviewSession(rules(), realisticSession("daily-gap"));
    expect(
      review.findings
        .filter((f) => f.ruleId === "daily-limit")
        .every((f) => f.status === "insufficient_evidence"),
    ).toBe(true);
    expect(
      review.findings.find(
        (f) => f.positionId === "D" && f.ruleId === "planned-risk",
      )?.status,
    ).toBe("deviated");
  });
  it.each(["stop", "target"] as const)(
    "rejects a %s on the wrong side of entry",
    (level) => {
      const c = position("C");
      c[level]!.price = level === "stop" ? 2160 : 2140;
      expect(
        planMetrics(c)[level === "stop" ? "risk" : "rewardRisk"],
      ).toBeNull();
    },
  );
  it.each([0, -1, NaN, Infinity])(
    "rejects invalid execution values: %s",
    (value) => {
      const c = position("C");
      c.executions[0].quantity = value;
      expect(planMetrics(c).risk).toBeNull();
      expect(grossResult(c)).toBeNull();
    },
  );
  it("abstains when fill coverage or first entry is missing", () => {
    const c = position("C");
    c.allEntriesCovered = false;
    expect(planMetrics(c).risk).toBeNull();
    c.allEntriesCovered = true;
    c.executions[0].timestamp = null;
    expect(planMetrics(c).risk).toBeNull();
    expect(check(c, "stop-before-entry").status).toBe("insufficient_evidence");
  });
  it("requires balanced, complete, chronological exits for a realised result", () => {
    const c = position("C");
    c.executions[1].quantity = 7;
    expect(grossResult(c)).toBeNull();
    c.executions[1].quantity = 8;
    c.executions[1].timestamp = "2026-09-23T10:30:00+05:30";
    expect(grossResult(c)).toBeNull();
    c.executions[1].timestamp = "2026-09-23T11:02:00+05:30";
    c.executionsComplete = false;
    expect(grossResult(c)).toBeNull();
  });
  it("recomputes all checks when thresholds change without mutating old snapshots", () => {
    const session = realisticSession();
    const original = reviewSession(rules(), session);
    const updated = reviewSession(
      createRules(4, "12:00", {
        ...DEFAULT_CHECKS,
        maxRisk: 700,
        minRewardRisk: 1.4,
      }),
      session,
    );
    expect(
      updated.findings
        .filter((f) => f.positionId === "D")
        .every((f) => f.status === "followed"),
    ).toBe(true);
    expect(
      original.findings.filter(
        (f) => f.positionId === "D" && f.status === "deviated",
      ),
    ).toHaveLength(4);
    expect(updated.rules.comparison).toBe("hypothetical");
  });
  it("can disable extra checks explicitly, and keeps legacy two-rule reviews", () => {
    expect(
      reviewSession(createRules(3, "11:00"), sampleSession()).findings,
    ).toHaveLength(8);
    expect(
      reviewSession(
        createRules(3, "11:00", {
          stopBeforeEntry: false,
          maxRisk: null,
          minRewardRisk: null,
        }),
        realisticSession(),
      ).findings,
    ).toHaveLength(8);
  });
  it.each([0, -1, NaN, Infinity])(
    "rejects invalid rule thresholds: %s",
    (threshold) => {
      expect(() =>
        reviewSession(
          createRules(3, "11:00", { ...DEFAULT_CHECKS, maxRisk: threshold }),
          realisticSession(),
        ),
      ).toThrow();
      expect(() =>
        reviewSession(
          createRules(3, "11:00", {
            ...DEFAULT_CHECKS,
            minRewardRisk: threshold,
          }),
          realisticSession(),
        ),
      ).toThrow();
    },
  );
  it("roundtrips the actual richer session and risk-plan focus", () => {
    let raw = "";
    const storage = {
      setItem: (_: string, value: string) => {
        raw = value;
      },
      getItem: () => raw,
    };
    const original = reviewSession(rules(), realisticSession("plan-gap"));
    const saved = saveReview(storage, original, "risk-plan", "D");
    original.session.positions[0].executions[0].price = 999;
    original.rules.checks!.maxRisk = 999;
    const restored = loadReview(storage)!;
    expect(restored).toEqual(saved);
    expect(restored.selectedPositionId).toBe("D");
    expect(restored.review.session.positions[0].executions[0].price).toBe(1240);
    expect(restored.review.rules.checks!.maxRisk).toBe(500);
  });
});

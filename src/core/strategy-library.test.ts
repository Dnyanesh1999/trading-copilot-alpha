import { describe, it, expect } from "vitest";
import { strategyPresets, createPresetSession } from "./strategy-library";
import { reviewSession, grossResult } from "./review";
import type { ConfirmedRules, SetupKind } from "./types";
const rules = (kind: SetupKind): ConfirmedRules => ({
  id: "test",
  confirmedAt: new Date().toISOString(),
  comparison: "hypothetical",
  timezone: "Asia/Kolkata",
  maxPositions: 3,
  cutoff: "11:00",
  enabledRules: ["planned-risk"],
  checks: { stopBeforeEntry: true, maxRisk: 500, minRewardRisk: 2 },
  setup: { kind, label: kind },
});
describe("documented strategy setups", () => {
  for (const preset of strategyPresets)
    it(`${preset.kind} has deterministic distinct outcomes, separate from P&L`, () => {
      const session = createPresetSession(preset.kind);
      expect(session).toEqual(createPresetSession(preset.kind));
      const findings = reviewSession(
        rules(preset.kind),
        session,
      ).findings.filter((f) => f.ruleId === "setup-entry");
      expect(findings.map((f) => f.status)).toEqual([
        "followed",
        "followed",
        "deviated",
        "insufficient_evidence",
      ]);
      expect(grossResult(session.positions[1])).toBeLessThan(0);
      expect(findings[0].sourceIds).toContain(
        `${session.positions[0].id}-signal`,
      );
    });
  it("includes explicit oversizing and unavailable plan evidence", () => {
    const session = createPresetSession("breakout");
    const findings = reviewSession(rules("breakout"), session).findings;
    expect(
      findings.find(
        (f) =>
          f.positionId === session.positions[2].id &&
          f.ruleId === "planned-risk",
      )?.status,
    ).toBe("deviated");
    expect(session.positions[2].executions[0].quantity).toBe(120);
    expect(session.positions[3].stop?.recordedAt).toBeNull();
    expect(session.positions[3].target?.recordedAt).toBeNull();
    expect(
      findings.find(
        (f) =>
          f.positionId === session.positions[3].id &&
          f.ruleId === "planned-risk",
      )?.status,
    ).toBe("insufficient_evidence");
  });
  it("rejects yesterday opening-range signal for a next-day entry", () => {
    const session = createPresetSession("opening-range");
    session.positions[0].executions[0].timestamp = "2026-10-16T09:40:00+05:30";
    expect(
      reviewSession(rules("opening-range"), session).findings[0].status,
    ).toBe("insufficient_evidence");
  });
  it("uses multi-day swing holds and same-day intraday examples", () => {
    for (const kind of ["breakout", "ma-reclaim"] as const) {
      const position = createPresetSession(kind).positions[0];
      expect(position.signal?.at).toContain("2026-10-14");
      expect(position.executions[0].timestamp).toContain("2026-10-15");
      expect(position.executions[1].timestamp).toContain("2026-10-19");
    }
    const position = createPresetSession("opening-range").positions[0];
    expect(position.signal?.at).toContain("2026-10-15");
    expect(position.executions[1].timestamp).toContain("2026-10-15");
  });
  it("rejects absent setup configuration for an enabled setup rule", () => {
    expect(() =>
      reviewSession(
        {
          ...rules("breakout"),
          setup: undefined,
          enabledRules: ["setup-entry"],
        },
        createPresetSession("breakout"),
      ),
    ).toThrow();
  });
  it("requires signal strictly before entry and does not infer short setups", () => {
    for (const tweak of ["equal", "late", "short"] as const) {
      const session = createPresetSession("breakout");
      const position = session.positions[0];
      if (tweak === "short") position.direction = "short";
      else
        position.signal!.at =
          tweak === "equal"
            ? position.executions[0].timestamp
            : "2026-10-15T12:00:00+05:30";
      expect(
        reviewSession(rules("breakout"), session).findings.find(
          (f) => f.ruleId === "setup-entry",
        )?.status,
      ).toBe("insufficient_evidence");
    }
  });
  it("requires actual reclaim rather than a close that was already above its prior reference", () => {
    const session = createPresetSession("ma-reclaim");
    session.positions[0].signal!.previousClose = 110;
    expect(reviewSession(rules("ma-reclaim"), session).findings[0].status).toBe(
      "deviated",
    );
    session.positions[0].signal!.previousClose = null;
    expect(reviewSession(rules("ma-reclaim"), session).findings[0].status).toBe(
      "insufficient_evidence",
    );
  });
  it("opening range needs exactly 09:30 same-day range end before signal", () => {
    for (const end of [
      "2026-10-15T09:29:00+05:30",
      "2026-10-14T09:30:00+05:30",
      "2026-10-15T09:30:01+05:30",
    ]) {
      const session = createPresetSession("opening-range");
      session.positions[0].signal!.rangeEnd = end;
      expect(
        reviewSession(rules("opening-range"), session).findings[0].status,
      ).toBe("insufficient_evidence");
    }
    const session = createPresetSession("opening-range");
    session.positions[0].signal!.at = "2026-10-15T09:29:00+05:30";
    expect(
      reviewSession(rules("opening-range"), session).findings[0].status,
    ).toBe("insufficient_evidence");
  });
});

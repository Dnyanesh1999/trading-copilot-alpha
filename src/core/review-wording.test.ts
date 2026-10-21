import { describe, expect, it } from "vitest";
import { createRules } from "./fixtures";
import { reviewSession, reviewSummary } from "./review";
import { defaultTrade, tradesToSession } from "./workspace";

const rules = () => ({
  ...createRules(2, "14:30", {
    stopBeforeEntry: true,
    maxRisk: 800,
    minRewardRisk: 2,
  }),
  setup: { kind: "ma-reclaim" as const, label: "20-period MA reclaim" },
});
const session = () =>
  tradesToSession(
    [
      {
        ...defaultTrade,
        instrument: "FICTIONAL-SBIN",
        quantity: "10",
        entryPrice: "100",
        enteredAt: "2026-10-20T10:00",
        stopDeclaration: "not-recorded",
      },
    ],
    true,
  );

describe("plain review wording", () => {
  it("names an unrecorded manual stop without implying it broke the rule", () => {
    const review = reviewSession(rules(), session(), "manual");
    const stop = review.findings.find((f) => f.ruleId === "stop-before-entry");
    expect(stop?.status).toBe("insufficient_evidence");
    expect(stop?.label).toBe("Stop not recorded");
    expect(
      [stop?.label, stop?.explanation, reviewSummary(review).description]
        .join(" ")
        .toLowerCase(),
    ).not.toContain("evidence missing");
  });

  it("calls a CSV signal gap not enough data", () => {
    const review = reviewSession(rules(), session(), "csv");
    const setup = review.findings.find((f) => f.ruleId === "setup-entry");
    expect(setup?.status).toBe("insufficient_evidence");
    expect(setup?.label).toBe("Entry setup: not enough data");
  });

  it("uses a singular verb when one of several trades needs attention", () => {
    const input = session();
    input.positions.push({
      ...input.positions[0],
      id: "fictional-clean",
      instrument: "FICTIONAL-CLEAN",
      stopDeclaration: "had-stop",
      stop: {
        id: "fictional-clean-stop",
        price: 95,
        recordedAt: "2026-10-20T09:45:00+05:30",
      },
      target: {
        id: "fictional-clean-target",
        price: 110,
        recordedAt: "2026-10-20T09:45:00+05:30",
      },
      executions: [
        {
          id: "fictional-clean-entry",
          side: "entry",
          price: 100,
          quantity: 10,
          timestamp: "2026-10-20T10:30:00+05:30",
        },
      ],
    });
    expect(reviewSummary(reviewSession(rules(), input, "manual")).title).toBe(
      "1 of 2 trades needs attention.",
    );
  });
});

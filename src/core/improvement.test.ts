import { describe, it, expect } from "vitest";
import { improvementsFor } from "./improvement";
import { createPresetSession, strategyPresets } from "./strategy-library";
import { defaultStrategy } from "./workspace";
const presetDraft = (preset: (typeof strategyPresets)[number]) => ({
  ...defaultStrategy,
  setup: { kind: preset.kind, label: preset.title },
});
import { confirmStrategy } from "./workspace";
import { reviewSession } from "./review";
describe("evidence-based improvement plan", () => {
  it("grounds the recommended action in confirmed deviations and keeps unknown separate", () => {
    const review = reviewSession(
      confirmStrategy(presetDraft(strategyPresets[0])),
      createPresetSession("breakout"),
    );
    const plans = improvementsFor(review);
    expect(plans[0].kind).toBe("deviation");
    expect(plans[0].findings.every((f) => f.status === "deviated")).toBe(true);
    expect(plans.find((p) => p.kind === "evidence")?.reason).toContain(
      "unknown",
    );
  });
  it("a loss alone does not generate a mistake or risk recommendation", () => {
    const session = createPresetSession("breakout");
    session.positions = [session.positions[1]];
    const plans = improvementsFor(
      reviewSession(confirmStrategy(presetDraft(strategyPresets[0])), session),
    );
    expect(plans).toHaveLength(1);
    expect(plans[0].kind).toBe("maintain");
  });
});

it("makes the sizing action concrete using the actual reviewed record", () => {
  const review = reviewSession(
    confirmStrategy(presetDraft(strategyPresets[0])),
    createPresetSession("breakout"),
  );
  const action = improvementsFor(review).find((p) => p.id === "planned-risk");
  expect(action?.steps[0]).toContain("100 whole units");
  expect(action?.steps[0]).toContain("₹600.00");
  expect(action?.findings[0].status).toBe("deviated");
});

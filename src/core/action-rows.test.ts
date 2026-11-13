import { it, expect } from "vitest";
import { actionRowsFor, focusRowFor } from "./action-rows";
import { createPresetSession, strategyPresets } from "./strategy-library";
import { presetDraft } from "../workspace/PresetPicker";
import { confirmStrategy } from "./workspace";
import { reviewSession } from "./review";
function fixture() {
  return reviewSession(
    confirmStrategy(presetDraft(strategyPresets[1])),
    createPresetSession("ma-reclaim"),
  );
}
it("groups each rule once and retains every affected trade", () => {
  const review = fixture();
  const copy = structuredClone(review.session.positions[2]);
  copy.id = "second";
  copy.instrument = "SECOND";
  copy.executions = copy.executions.map((e) => ({
    ...e,
    id: `second-${e.id}`,
  }));
  review.session.positions.push(copy);
  const next = reviewSession(review.rules, review.session);
  const rows = actionRowsFor(next);
  expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
  expect(rows.length).toBeLessThanOrEqual(6);
  const risk = rows.find((r) => r.id === "planned-risk")!;
  expect(risk.details.some((d) => d.happened.includes("SECOND"))).toBe(true);
  expect(risk.details.some((d) => d.happened.includes("DEMO-GAMMA"))).toBe(
    true,
  );
  const gaps=rows.find(r=>r.id==="missing-records")!;
  expect(gaps.status).toBe("insufficient_evidence");
  expect(new Set(gaps.details.map(d=>d.finding.positionId)).size).toBe(gaps.details.length);
  expect(rows.filter(r=>r.id!=="missing-records").flatMap(r=>r.details).every(d=>d.finding.status==="deviated"||d.finding.reportedComparison?.breached)).toBe(true);
});
it("uses concise numbers once and keeps raw signal comparisons in proof", () => {
  const rows = actionRowsFor(fixture());
  const risk = rows
    .find((r) => r.id === "planned-risk")!
    .details.find((d) => d.finding.status === "deviated")!;
  expect(risk.happened).toContain("₹100.00 over your ₹500.00 cap");
  expect(risk.before).toContain("100 shares or fewer");
  expect(risk.before).not.toContain("₹600");
  const signal = rows.find((r) => r.id === "setup-entry")!;
  expect(signal.details[0].happened).toContain("20-period MA reclaim setup");
  expect(signal.details[0].happened).not.toMatch(/[≤≥]/);
});
it("keeps late and missing evidence separate from confirmed breaks and does not mutate", () => {
  const review = fixture();
  const before = structuredClone(review);
  const rows = actionRowsFor(review);
  expect(
    rows
      .flatMap((r) => r.details)
      .filter(
        (d) =>
          d.finding.status === "insufficient_evidence" &&
          d.finding.reportedComparison,
      )
      .every((d) => d.happened.includes("reported")),
  ).toBe(true);
  expect(review).toEqual(before);
  expect(rows.every((r) => !r.title.includes("DEMO"))).toBe(true);
  expect(
    rows
      .flatMap((r) => r.details)
      .every((d) => !/(next DEMO|Record DEMO)/.test(d.before)),
  ).toBe(true);
});
it("restores old saved focus titles without changing storage", () => {
  expect(focusRowFor(fixture(), "Check size against your risk cap")?.id).toBe(
    "planned-risk",
  );
});

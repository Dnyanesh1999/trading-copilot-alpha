import { expect, it } from "vitest";
import { glossary, recordTime, termExample } from "./glossary";
import { realisticSession } from "./fixtures";
import { planMetrics, reportedPlanMetrics } from "./review";
it("provides one shared explanation/example for every requested term", () => {
  expect(Object.keys(glossary)).toHaveLength(10);
  for (const value of Object.values(glossary)) {
    expect(value.meaning).toBeTruthy();
    expect(value.example).toBeTruthy();
  }
});
it("formats records explicitly in IST including date rollover", () => {
  expect(recordTime("2026-11-02T05:00:00Z")).toBe("2 Nov, 10:30 IST");
  expect(recordTime("2026-11-01T20:00:00Z")).toBe("2 Nov, 01:30 IST");
  expect(recordTime(null)).toBe("time not recorded");
});
it("uses selected trade numbers and marks late plans reported", () => {
  for (const p of realisticSession().positions) {
    const m = planMetrics(p);
    const reported = reportedPlanMetrics(p);
    const text = termExample("reward-risk", p);
    expect(text).toContain(p.instrument);
    if (m.rewardRisk !== null)
      expect(text).toContain(`${m.rewardRisk.toFixed(2)}R`);
    else if (reported.rewardRisk !== null) expect(text).toContain("reported");
  }
});

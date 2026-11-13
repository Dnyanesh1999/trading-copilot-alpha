import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createHistoricalReplay, parseDailyBars } from "./historical-replay";
import { confirmStrategy, defaultStrategy } from "./workspace";
import { reviewSession } from "./review";
import { exportReview, validateReviewEntry } from "./saved-review";
import { DEMO_NOTICE } from "./demo-label";
import { replayBanner, replayName } from "../workspace/replay-display";

describe("original fictional CSV replay demos", () => {
  for (const outcome of ["followed", "deviated"] as const) {
    it(`keeps ${outcome} DEMO provenance in review, export and history`, async () => {
      const fileName = `DEMO-fictional-${outcome}.csv`;
      const bars = parseDailyBars(
        readFileSync(`public/demo/${fileName}`, "utf8"),
      );
      expect(bars).toHaveLength(22);
      const session = await createHistoricalReplay(
        bars,
        bars[21].date,
        "DEMO",
        5,
        110,
        180,
        { source: "csv", fileName, fetchedAt: "2026-11-13T00:00:00.000Z" },
      );
      const rules = confirmStrategy({
        ...defaultStrategy,
        setup: { kind: "breakout", label: "Resistance breakout" },
      });
      const review = reviewSession(rules, session, "csv");
      expect(
        review.findings.find((f) => f.ruleId === "setup-entry")?.status,
      ).toBe(outcome);
      const entry = {
        id: "demo",
        name: "DEMO fictional replay",
        savedAt: "2026-11-13T00:00:00.000Z",
        strategyName: "Breakout",
        source: "csv" as const,
        review,
        focus: "Choose later",
      };
      expect(exportReview(entry).dataNotice).toBe(DEMO_NOTICE);
      expect(replayName(session)).toContain(DEMO_NOTICE);
      expect(replayBanner(session)).toContain(DEMO_NOTICE);
      expect(
        validateReviewEntry(entry)?.review.session.historicalReplay?.series
          ?.fileName,
      ).toBe(fileName);
    });
  }
});

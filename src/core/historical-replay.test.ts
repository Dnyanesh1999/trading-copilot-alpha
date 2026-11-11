import { describe, expect, it } from "vitest";
import { createHistoricalReplay, parseDailyBars } from "./historical-replay";
import { reviewSession, REVIEW_LOGIC_VERSION } from "./review";
import { validateReviewEntry } from "./saved-review";
import { confirmStrategy, defaultStrategy } from "./workspace";

const dates = Array.from(
  { length: 23 },
  (_, i) => `2025-01-${String(i + 1).padStart(2, "0")}`,
);
const rows = dates.map((date, i) =>
  i < 20
    ? `${date},90,100,80,90`
    : i === 20
      ? `${date},100,150,95,110`
      : `${date},112,160,90,150`,
);
const csv = (data: string[]) =>
  ["Date,Open,High,Low,Close", ...data].join("\n");
const rules = confirmStrategy({
  ...defaultStrategy,
  style: "swing",
  setup: { kind: "breakout", label: "Resistance breakout" },
  enabledRules: ["stop-before-entry", "planned-risk", "reward-risk"],
});

describe("historical breakout replay", () => {
  it("uses only the 20 bars before the signal and enters at the next open", () => {
    const bars = parseDailyBars(csv([...rows].reverse()));
    const session = createHistoricalReplay(
      bars,
      dates[21],
      " sbin ",
      2,
      102,
      136,
    );
    expect(session.historicalReplay).toEqual({
      lookbackStart: dates[0],
      lookbackEnd: dates[19],
      resistanceDate: dates[0],
    });
    expect(session.positions[0].signal).toMatchObject({
      close: 110,
      reference: 100,
    });
    expect(session.positions[0].executions[0]).toMatchObject({
      price: 112,
      timestamp: `${dates[21]}T09:15:00+05:30`,
    });
    expect(reviewSession(rules, session, "csv").findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: "setup-entry", status: "followed" }),
      ]),
    );
  });

  it("flags equality as a deviation and preserves the replay after saving", () => {
    const equalRows = [...rows];
    equalRows[20] = `${dates[20]},100,150,95,100`;
    const session = createHistoricalReplay(
      parseDailyBars(csv(equalRows)),
      dates[21],
      "SBIN",
      1,
      null,
      null,
    );
    const restored = validateReviewEntry({
      id: "replay",
      name: "Historical replay",
      strategyName: "Breakout",
      savedAt: new Date().toISOString(),
      focus: "Later",
      source: "csv",
      reviewLogicVersion: REVIEW_LOGIC_VERSION,
      review: reviewSession(rules, session, "csv"),
    });
    expect(restored?.review.session.historicalReplay).toEqual(
      session.historicalReplay,
    );
    expect(restored?.review.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: "setup-entry", status: "deviated" }),
        expect.objectContaining({
          ruleId: "planned-risk",
          status: "insufficient_evidence",
        }),
      ]),
    );
  });

  it("rejects duplicate dates and impossible OHLC rows", () => {
    expect(() => parseDailyBars(csv([...rows, rows[0]]))).toThrow(
      /unique ISO date/,
    );
    expect(() =>
      parseDailyBars(
        csv([...rows.slice(0, -1), `${dates[22]},120,110,100,105`]),
      ),
    ).toThrow(/OHLC/);
    expect(() => parseDailyBars(csv(rows.slice(0, 21)))).toThrow(/at least 22/);
  });
});

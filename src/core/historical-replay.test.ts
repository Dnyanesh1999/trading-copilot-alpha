import { describe, expect, it } from "vitest";
import { createHistoricalReplay, parseDailyBars } from "./historical-replay";
import { reviewSession, REVIEW_LOGIC_VERSION } from "./review";
import { validateReviewEntry } from "./saved-review";
import { confirmStrategy, defaultStrategy } from "./workspace";
import { exportReview } from "./saved-review";
import { canonicalReplayCsv, hashReplayBars } from "./replay-evidence";
import { createHash } from "node:crypto";
import type { Session } from "./types";

const dates = Array.from({ length: 40 }, (_, i) =>
  new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10),
)
  .filter((date) => ![0, 6].includes(new Date(date).getUTCDay()))
  .slice(0, 23);
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
  it("uses only the 20 bars before the signal and enters at the next open", async () => {
    const bars = parseDailyBars(csv([...rows].reverse()));
    const session = await createHistoricalReplay(
      bars,
      dates[21],
      " sbin ",
      2,
      102,
      136,
    );
    expect(session.historicalReplay).toMatchObject({
      lookbackStart: dates[0],
      lookbackEnd: dates[19],
      resistanceDate: dates[0],
      maxGapDays: 3,
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

  it("flags equality as a deviation and preserves the replay after saving", async () => {
    const equalRows = [...rows];
    equalRows[20] = `${dates[20]},100,150,95,100`;
    const session = await createHistoricalReplay(
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

  const replay = (bars = parseDailyBars(csv(rows))) =>
    createHistoricalReplay(bars, bars[21].date, "SBIN", 1, null, null);
  const saved = (session: Session) => ({
    id: "replay",
    name: "Historical replay",
    strategyName: "Breakout",
    savedAt: "2026-11-11T10:00:00.000Z",
    focus: "Later",
    source: "csv",
    reviewLogicVersion: REVIEW_LOGIC_VERSION,
    review: reviewSession(rules, session, "csv"),
  });
  // Shifting from a Wednesday gives either a valid Monday or Tuesday after the gap.
  const gapBars = (days: number) =>
    parseDailyBars(csv(rows))
      .slice(0, 22)
      .map((bar, i) => ({
        ...bar,
        date:
          i < 1
            ? bar.date
            : new Date(Date.parse(bar.date) + days * 86_400_000)
                .toISOString()
                .slice(0, 10),
      }));

  it("accepts a CSV weekend row and audits its date on save/restore", async () => {
    const bars = parseDailyBars(csv(rows));
    bars[2].date = "2025-01-04";
    const entry = saved(await replay(bars));
    expect(entry.review.session.historicalReplay?.weekendDates).toEqual([
      "2025-01-04",
    ]);
    expect(validateReviewEntry(entry)).not.toBeNull();
    entry.review.session.historicalReplay!.weekendDates = [];
    expect(validateReviewEntry(entry)).toBeNull();
    delete entry.review.session.historicalReplay!.weekendDates;
    expect(validateReviewEntry(entry)).toBeNull();
  });

  it("accepts and revalidates Dhan weekend evidence", async () => {
    const bars = parseDailyBars(csv(rows));
    bars[2].date = "2025-01-04";
    const session = await createHistoricalReplay(
      bars,
      dates[21],
      "SBIN",
      1,
      null,
      null,
      {
        source: "dhan",
        fetchedAt: "2026-11-11T10:00:00Z",
      },
    );
    expect(session.historicalReplay?.weekendDates).toEqual(["2025-01-04"]);
    expect(validateReviewEntry(saved(session))).not.toBeNull();
  });

  it("loads pre-Step-2 evidence without weekendDates when no weekends exist", async () => {
    const entry = saved(await replay());
    delete entry.review.session.historicalReplay!.weekendDates;
    expect(validateReviewEntry(entry)).not.toBeNull();
    entry.review.session.historicalReplay!.weekendDates = ["2025-01-04"];
    expect(validateReviewEntry(entry)).toBeNull();
  });

  it.each(["signal.close", "signal.reference", "signal.at", "entry.price"])(
    "rejects tampered %s even when the stored bars and hash are intact",
    async (field) => {
      const entry = saved(await replay());
      const position = entry.review.session.positions[0];
      if (field === "signal.close") position.signal!.close = 99;
      if (field === "signal.reference") position.signal!.reference = 111;
      if (field === "signal.at")
        position.signal!.at = `${dates[19]}T15:30:00+05:30`;
      if (field === "entry.price") position.executions[0].price += 1;
      expect(validateReviewEntry(entry)).toBeNull();
    },
  );

  it("rejects a six-day gap with a precise coverage message", async () => {
    // Leave the first row on Wed, then start the remaining weekdays next Tue.
    const bars = gapBars(5);
    await expect(replay(bars)).rejects.toThrow(
      "Prices are missing between 2025-01-01 and 2025-01-07. Use a complete daily series.",
    );
  });

  it("accepts a five-day gap and records the largest calendar gap", async () => {
    // Generate weekday rows beginning Monday after the first Wednesday.
    const laterDates = Array.from({ length: 40 }, (_, i) =>
      new Date(Date.UTC(2025, 0, 6 + i)).toISOString().slice(0, 10),
    ).filter((date) => ![0, 6].includes(new Date(date).getUTCDay()));
    const bars = parseDailyBars(csv(rows))
      .slice(0, 22)
      .map((bar, i) => ({
        ...bar,
        date: i === 0 ? "2025-01-01" : laterDates[i - 1],
      }));
    expect((await replay(bars)).historicalReplay?.maxGapDays).toBe(5);
  });

  it("ignores coverage problems outside the 22 rows used", async () => {
    const bars = parseDailyBars(csv(rows)).slice(0, 22);
    bars.push({ ...bars[21], date: "2025-03-01" });
    const session = await createHistoricalReplay(
      bars,
      dates[21],
      "SBIN",
      1,
      null,
      null,
    );
    expect(session.historicalReplay?.series?.bars).toHaveLength(22);
    expect(session.historicalReplay?.maxGapDays).toBe(3);
  });

  it("uses stable canonical CSV SHA-256 independent of metadata and property order", async () => {
    const bars = parseDailyBars(csv(rows));
    const session = await replay(bars);
    const series = session.historicalReplay!.series!;
    const reordered = series.bars.map(({ date, open, high, low, close }) => ({
      close,
      low,
      high,
      open,
      date,
    }));
    expect(await hashReplayBars(reordered)).toBe(series.sha256);
    expect(series.sha256).toBe(
      createHash("sha256")
        .update(canonicalReplayCsv(series.bars))
        .digest("hex"),
    );
    expect(canonicalReplayCsv(series.bars)).toMatch(
      /^date,open,high,low,close,volume\n2025-01-01,90,100,80,90,\n/,
    );
    expect(canonicalReplayCsv(series.bars).endsWith("\n")).toBe(true);
    const second = await replay(bars);
    expect(second.historicalReplay?.series?.sha256).toBe(series.sha256);
    bars[0].open = 91;
    expect(series.bars[0].open).toBe(90);
  });

  it("rejects a tampered but valid OHLC bar or checksum", async () => {
    const entry = saved(await replay());
    entry.review.session.historicalReplay!.series!.bars[0].open = 91;
    expect(validateReviewEntry(entry)).toBeNull();
    const badHash = saved(await replay());
    badHash.review.session.historicalReplay!.series!.sha256 = "0".repeat(64);
    expect(validateReviewEntry(badHash)).toBeNull();
  });

  it("loads old saved replay reviews without series or coverage metadata", async () => {
    const entry = saved(await replay());
    delete entry.review.session.historicalReplay!.series;
    delete entry.review.session.historicalReplay!.maxGapDays;
    expect(validateReviewEntry(entry)?.review.session.historicalReplay).toEqual(
      entry.review.session.historicalReplay,
    );
  });

  it("preserves optional CSV volume including zero in snapshots and exports without tokens", async () => {
    const prices = [
      "date,open,high,low,close,volume",
      ...rows.map(
        (row, i) => `${row},${i === 0 ? "0" : i === 1 ? "" : "1000.5"}`,
      ),
    ].join("\n");
    const bars = parseDailyBars(prices);
    expect(bars[0].volume).toBe(0);
    expect(bars[1]).not.toHaveProperty("volume");
    expect(bars[2].volume).toBe(1000.5);
    const session = await createHistoricalReplay(
      bars,
      dates[21],
      "SBIN",
      1,
      null,
      null,
      {
        source: "csv",
        fetchedAt: "2026-11-11T10:00:00.000Z",
        fileName: "fixture.csv",
      },
    );
    const entry = validateReviewEntry(saved(session))!;
    expect(entry).not.toBeNull();
    const exported = exportReview(entry);
    expect(exported.review.session.historicalReplay?.series).toEqual(
      session.historicalReplay?.series,
    );
    expect(JSON.stringify(exported)).not.toContain("token");
    expect(session.historicalReplay?.series?.bars[0].volume).toBe(0);
    const volumeChanged = structuredClone(
      session.historicalReplay!.series!.bars,
    );
    volumeChanged[0].volume = 1;
    expect(await hashReplayBars(volumeChanged)).not.toBe(
      session.historicalReplay?.series?.sha256,
    );
    expect(() => parseDailyBars(prices.replace(",1000.5", ",-1"))).toThrow(
      /volume/,
    );
  });

  it("validates present evidence shape, prices, timestamp and coverage", async () => {
    const entry = saved(await replay());
    for (const mutate of [
      (s: NonNullable<Session["historicalReplay"]>) => {
        s.series!.bars.pop();
      },
      (s: NonNullable<Session["historicalReplay"]>) => {
        s.series!.bars[0].low = 101;
      },
      (s: NonNullable<Session["historicalReplay"]>) => {
        s.series!.fetchedAt = "yesterday";
      },
      (s: NonNullable<Session["historicalReplay"]>) => {
        s.maxGapDays = 1;
      },
      (s: NonNullable<Session["historicalReplay"]>) => {
        s.series!.bars[0].volume = -1;
      },
    ]) {
      const bad = structuredClone(entry);
      mutate(bad.review.session.historicalReplay!);
      expect(validateReviewEntry(bad)).toBeNull();
    }
  });

  it("stores only evidence fields for Dhan and never copies a token into exports", async () => {
    const bars = parseDailyBars(csv(rows)).map((bar) => ({
      ...bar,
      token: "synthetic-secret",
    }));
    const provenance = {
      source: "dhan" as const,
      fetchedAt: "2026-11-11T10:00:00Z",
      token: "synthetic-secret",
    };
    const session = await createHistoricalReplay(
      bars,
      dates[21],
      "SBIN",
      1,
      null,
      null,
      provenance,
    );
    const entry = validateReviewEntry(saved(session))!;
    expect(entry).not.toBeNull();
    const evidence = entry.review.session.historicalReplay!;
    expect(evidence.priceSource).toBe("dhan");
    expect(evidence.series?.source).toBe("dhan");
    expect(JSON.stringify(exportReview(entry))).not.toMatch(
      /token|synthetic-secret/,
    );
    const injected = structuredClone(entry);
    Object.assign(injected.review.session.historicalReplay!.series!, {
      token: "synthetic-secret",
    });
    expect(validateReviewEntry(injected)).toBeNull();
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

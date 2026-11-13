// Original synthetic DEMO-style prices; no real instrument data.
// Extra decimal places exercise unrounded evidence vs two-decimal display.
import { describe, expect, it } from "vitest";
import { REPLAY_CHART_COLORS, replayChartData } from "./replay-chart-data";
import type { DailyBar } from "./types";

export function chartBars(): DailyBar[] {
  const dates = Array.from({ length: 40 }, (_, i) =>
    new Date(Date.UTC(2025, 1, 3 + i)).toISOString().slice(0, 10),
  )
    .filter((date) => ![0, 6].includes(new Date(date).getUTCDay()))
    .slice(0, 22);
  const bars = dates.map((date) => ({
    date,
    open: 140,
    high: 145,
    low: 130,
    close: 142,
  }));
  bars[14].high = 149.123456;
  bars[20] = {
    date: dates[20],
    open: 150,
    high: 165,
    low: 135,
    close: 160.5,
  };
  bars[21] = {
    date: dates[21],
    open: 160.654321,
    high: 170.345678,
    low: 155.234567,
    close: 166.234567,
  };
  return bars;
}

describe("replay chart data", () => {
  it("maps exactly 22 chronological candles without rounding or mutation", () => {
    const bars = chartBars();
    const original = structuredClone(bars);
    const model = replayChartData(bars, {});
    expect(model.candles).toHaveLength(22);
    expect(model.candles[21]).toMatchObject({
      time: "2025-03-04",
      open: 160.654321,
    });
    expect(bars).toEqual(original);
  });
  it("uses the largest high of bars 0–19, excluding the signal and entry highs", () => {
    const model = replayChartData(chartBars(), {});
    expect(model.resistance).toBe(149.123456);
    expect(model.lines[0]).toMatchObject({
      price: 149.123456,
      title: "Resistance ₹149.12",
    });
    expect(model.markers[0]).toMatchObject({
      time: "2025-02-21",
      text: "20-day high",
    });
    expect(model.markers[1]).toMatchObject({
      time: "2025-03-03",
      text: "Signal close",
    });
    expect(model.markers[2]).toMatchObject({
      time: "2025-03-04",
      shape: "arrowUp",
      text: "Entry ₹160.65 (open)",
    });
  });
  it.each([
    { close: 160.5, color: "#e86f5a" },
    { close: 149.123456, color: "#a22b2b" },
    { close: 140.75, color: "#a22b2b" },
  ])("colours signal close $close as $color", ({ close, color }) => {
    const bars = chartBars();
    bars[20].close = close;
    const model = replayChartData(bars, {});
    expect(model.candles[20]).toMatchObject({
      color,
      wickColor: color,
      borderColor: color,
    });
    expect(model.candles[19]).not.toHaveProperty("color");
  });
  it("includes each plan line only when its level is present", () => {
    const bars = chartBars();
    expect(replayChartData(bars, {}).lines).toHaveLength(1);
    expect(
      replayChartData(bars, { stop: 140 }).lines.map((line) => line.title),
    ).toEqual(["Resistance ₹149.12", "Stop ₹140.00"]);
    expect(
      replayChartData(bars, { target: 200 }).lines.map((line) => line.title),
    ).toEqual(["Resistance ₹149.12", "Target ₹200.00"]);
    expect(
      replayChartData(bars, { stop: 140, target: 200 }).lines,
    ).toHaveLength(3);
  });
  it("keeps optional and zero volume without inventing missing values", () => {
    const bars = chartBars();
    expect(replayChartData(bars, {}).volume).toEqual([]);
    bars[0].volume = 0;
    bars[1].volume = 1234;
    expect(replayChartData(bars, {}).volume).toEqual([
      { time: bars[0].date, value: 0, color: REPLAY_CHART_COLORS.volume },
      { time: bars[1].date, value: 1234, color: REPLAY_CHART_COLORS.volume },
    ]);
  });
});

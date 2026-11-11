import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ReviewView } from "./ReviewView";
import { CurrentFocus } from "./CurrentFocus";
import { replayName } from "./replay-display";
import { createHistoricalReplay } from "../core/historical-replay";
import { confirmStrategy, defaultStrategy } from "../core/workspace";
import { reviewSession } from "../core/review";
import type { DailyBar } from "../core/types";
import type { ReviewEntry } from "../core/saved-review";

vi.mock("./InternalJourney", () => ({ workspaceJourney: { action: vi.fn() } }));

async function entry(
  source: "dhan" | "csv" = "dhan",
  weekend = false,
  close = 625.5,
): Promise<ReviewEntry> {
  const dates = Array.from({ length: 40 }, (_, i) =>
    new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10),
  )
    .filter((date) => ![0, 6].includes(new Date(date).getUTCDay()))
    .slice(0, 22);
  if (weekend) dates[2] = "2025-01-04";
  const bars: DailyBar[] = dates.map((date) => ({
    date,
    open: 600,
    high: 619.799988,
    low: 580,
    close: 610,
  }));
  bars[20] = { ...bars[20], high: 630, close };
  bars[21] = { ...bars[21], open: 625.549988, high: 630 };
  const session = await createHistoricalReplay(
    bars,
    dates[21],
    "SBIN",
    10,
    null,
    null,
    {
      source,
      fetchedAt: "2026-11-11T10:00:00.000Z",
    },
  );
  const rules = confirmStrategy({
    ...defaultStrategy,
    setup: { kind: "breakout", label: "Resistance breakout" },
  });
  return {
    id: "qa",
    name: "Old replay label",
    strategyName: "Breakout",
    source: "csv",
    focus: "",
    savedAt: "2026-11-11T10:00:00.000Z",
    review: reviewSession(rules, session, "csv"),
  };
}
const render = (entry: ReviewEntry) =>
  renderToStaticMarkup(
    <ReviewView
      entry={entry}
      onSave={() => {}}
      onBack={() => {}}
      onCorrect={() => {}}
      saved={false}
    />,
  );

describe("historical replay presentation", () => {
  it("displays prices to two decimals in banner and proof without changing evidence or verdicts", async () => {
    const value = await entry();
    const original = structuredClone(value);
    const html = render(value);
    expect(html).toContain(
      "Signal: 2025-01-29 close ₹625.50 vs resistance ₹619.80",
    );
    expect(html).toContain("20 sessions 2025-01-01–2025-01-28");
    expect(html).toContain("Simulated entry at the 2025-01-30 open, ₹625.55.");
    expect(html).toContain("625.50 &gt; 619.80; signal precedes entry");
    expect(html).toContain("Signal close: 625.50; reference: 619.80;");
    expect(html).not.toContain("619.799988");
    expect(value.review.findings[0].calculation).toContain("619.799988");
    expect(value).toEqual(original);
  });

  it("hides stop correction and uses simulation instructions throughout the replay plan", async () => {
    const value = await entry("dhan", false, 611.799988);
    const html = render(value);
    expect(html).not.toContain("Correct this stop record");
    expect(html).not.toContain("stop-record-editor");
    expect(html).not.toContain("Use the initial stop you had at entry");
    expect(html).not.toMatch(
      /your next trade|the next trade|Before your next trade/,
    );
    expect(html).toContain(
      "Simulated plan: add a stop and target in the replay form to check risk and reward.",
    );
    expect(html).toContain("In this replay, compare the signal close");
    expect(value.review.findings[0].status).toBe("deviated");
    expect(renderToStaticMarkup(<CurrentFocus entry={value} />)).not.toContain(
      "your next trade",
    );
    delete value.review.session.historicalReplay;
    expect(render(value)).toContain("stop-record-editor");
  });

  it("warns about CSV weekend rows and accepts Dhan weekends without the CSV notice", async () => {
    expect(render(await entry("csv", true))).toContain(
      "Includes a weekend session on 2025-01-04. Check it was a real exchange session.",
    );
    expect(render(await entry("dhan", true))).not.toContain(
      "Includes a weekend session",
    );
  });

  it("shows the simulated-plan note when either level is missing", async () => {
    for (const [stop, target] of [
      [null, null],
      [610, null],
      [null, 660],
    ]) {
      const value = await entry();
      const position = value.review.session.positions[0];
      const recordedAt = position.signal!.at;
      position.stop =
        stop === null ? null : { id: "stop", price: stop, recordedAt };
      position.target =
        target === null ? null : { id: "target", price: target, recordedAt };
      value.review = reviewSession(
        value.review.rules,
        value.review.session,
        "csv",
      );
      expect(render(value)).toContain(
        "Simulated plan: add a stop and target in the replay form to check risk and reward.",
      );
    }
  });

  it("hides the simulated-plan note when both levels are present", async () => {
    const value = await entry();
    const position = value.review.session.positions[0];
    const recordedAt = position.signal!.at;
    position.stop = { id: "stop", price: 610, recordedAt };
    position.target = { id: "target", price: 660, recordedAt };
    value.review = reviewSession(
      value.review.rules,
      value.review.session,
      "csv",
    );
    expect(render(value)).not.toContain(
      "Simulated plan: add a stop and target",
    );
    expect(render(value)).not.toContain("stop-record-editor");
  });

  it.each(["dhan", "csv"] as const)(
    "labels %s replay history with symbol, date and source",
    async (source) => {
      const value = await entry(source);
      expect(replayName(value.review.session)).toBe(
        `Historical replay · SBIN · 2025-01-30 · ${source === "dhan" ? "Dhan" : "CSV"}`,
      );
    },
  );
});

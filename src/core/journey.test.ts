import { describe, expect, it } from "vitest";
import { createJourney } from "./journey";
function harness(enabled = true) {
  let now = 0,
    serial = 0;
  const log = createJourney(
    enabled,
    () => now,
    () => "2026-10-11T00:00:00Z",
    () => `id-${++serial}`,
  );
  return {
    log,
    time: (n: number) => {
      now = n;
    },
  };
}
describe("internal journey", () => {
  it("collects nothing when disabled", () => {
    const { log } = harness(false);
    log.start("rules");
    log.action("focus_saved");
    log.stage("complete");
    expect(log.export().events).toEqual([]);
  });
  it("excludes hidden time and preserves navigation intervals", () => {
    const { log, time } = harness();
    log.start("rules");
    time(100);
    log.visibility(false);
    time(900);
    log.visibility(true);
    time(1000);
    log.stage("session");
    time(1100);
    log.end();
    expect(
      log
        .export()
        .events.filter((e) => e.type === "visible_interval")
        .map((e) => e.durationMs),
    ).toEqual([100, 100, 100]);
  });
  it("counts completion once and never counts saved reopen as a new start", () => {
    const { log } = harness();
    log.start("rules");
    log.action("save_failed");
    log.action("focus_saved");
    log.action("focus_saved");
    log.start("complete", false);
    log.action("focus_saved");
    const events = log.export().events;
    expect(events.filter((e) => e.type === "session_started")).toHaveLength(1);
    expect(events.filter((e) => e.type === "focus_saved")).toHaveLength(1);
    expect(events.filter((e) => e.type === "saved_review_opened")).toHaveLength(
      1,
    );
    expect(new Set(events.map((e) => e.eventId)).size).toBe(events.length);
  });
  it("does not double count time across exports and does not expose mutable records", () => {
    const { log, time } = harness();
    log.start("rules");
    time(20);
    const first = log.export();
    first.events[0].stage = "complete";
    time(40);
    const next = log.export();
    expect(next.events[0].stage).toBe("rules");
    expect(
      next.events
        .filter((e) => e.type === "visible_interval")
        .reduce((a, e) => a + e.durationMs!, 0),
    ).toBe(40);
  });
  it("records only explicit interactions, ending a session prevents further events", () => {
    const { log } = harness();
    log.start("session");
    expect(log.export().events.some((e) => e.type === "evidence_opened")).toBe(
      false,
    );
    log.action("evidence_opened");
    log.end();
    const count = log.export().events.length;
    log.action("position_selected");
    expect(log.export().events).toHaveLength(count);
  });
});

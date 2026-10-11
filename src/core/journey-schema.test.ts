import { describe, expect, it } from "vitest";
import { validateBatch, validateEvent } from "./journey-schema";
import type { JourneyEvent } from "./journey";
export function event(sequence = 1): JourneyEvent {
  return {
    version: 1,
    build: "internal-journey-v1",
    mode: "internal",
    eventId: crypto.randomUUID(),
    sessionId: "b66a2a56-2bb0-4b55-8297-e03e3a4a6666",
    sequence,
    at: "2026-10-11T12:00:00.000Z",
    type: "session_started",
    stage: "rules",
  };
}
describe("closed collection schema", () => {
  it("rebuilds valid events in a stable order", () => {
    const original = event();
    expect(
      JSON.stringify(
        validateEvent(Object.fromEntries(Object.entries(original).reverse())),
      ),
    ).toBe(JSON.stringify(original));
  });
  it.each([
    { strategy: "private text" },
    { email: "do-not-collect" },
    { mode: "participant" },
    { sequence: 0 },
    { eventId: "account-number" },
    { at: "not-a-date" },
    { type: "free-text" },
    { stage: "unknown" },
    { durationMs: 5 },
  ])("rejects unsupported fields or values: %j", (patch) => {
    expect(validateEvent({ ...event(), ...patch })).toBeNull();
  });
  it("requires nonnegative integral durations only on visible intervals", () => {
    for (const durationMs of [-1, 1.2, NaN, Infinity])
      expect(
        validateEvent({ ...event(), type: "visible_interval", durationMs }),
      ).toBeNull();
    expect(
      validateEvent({ ...event(), type: "visible_interval", durationMs: 0 }),
    ).not.toBeNull();
  });
  it("rejects the whole batch if any event is invalid and bounds batch size", () => {
    expect(
      validateBatch({ events: [event(), { ...event(2), trade: 123 }] }),
    ).toBeNull();
    expect(validateBatch({ events: [] })).toBeNull();
    expect(
      validateBatch({
        events: Array.from({ length: 51 }, (_, i) => event(i + 1)),
      }),
    ).toBeNull();
    expect(validateBatch({ events: [event()], extra: true })).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { stopRecordNeedsCorrection } from "./review";
import type { Position } from "./types";

const valid: Position = {
  id: "fictional-tcs",
  instrument: "FICTIONAL-TCS",
  direction: "long",
  firstEntryCovered: true,
  allEntriesCovered: true,
  stopDeclaration: "had-stop",
  executions: [
    {
      id: "entry",
      side: "entry",
      price: 100,
      quantity: 10,
      timestamp: "2026-10-20T10:00:00+05:30",
    },
  ],
  stop: {
    id: "stop",
    price: 95,
    recordedAt: "2026-10-20T09:45:00+05:30",
  },
};

describe("stop correction display", () => {
  it("starts collapsed for a valid recorded stop", () => {
    expect(stopRecordNeedsCorrection(valid)).toBe(false);
  });

  it("starts expanded for explicit no-stop, not-recorded and legacy blank records", () => {
    for (const stopDeclaration of ["no-stop", "not-recorded"] as const)
      expect(
        stopRecordNeedsCorrection({ ...valid, stopDeclaration, stop: null }),
      ).toBe(true);
    expect(
      stopRecordNeedsCorrection({
        ...valid,
        stopDeclaration: undefined,
        stop: null,
      }),
    ).toBe(true);
  });

  it("starts expanded for an invalid or untimed initial stop", () => {
    expect(
      stopRecordNeedsCorrection({
        ...valid,
        stop: { ...valid.stop!, price: 105 },
      }),
    ).toBe(true);
    expect(
      stopRecordNeedsCorrection({
        ...valid,
        stop: { ...valid.stop!, recordedAt: null },
      }),
    ).toBe(true);
  });
});

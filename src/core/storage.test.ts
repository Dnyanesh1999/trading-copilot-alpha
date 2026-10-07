import { describe, expect, it } from "vitest";
import { createRules, sampleSession } from "./fixtures";
import { reviewSession } from "./review";
import { loadReview, saveReview, STORAGE_KEY } from "./storage";
import type { SavedReview } from "./types";

function memoryStorage() {
  const items = new Map<string, string>();
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => {
      items.set(key, value);
    },
  };
}
const review = () => reviewSession(createRules(3, "11:00"), sampleSession());

describe("local saved review", () => {
  it.each(["entry-check", "daily-limit", "later"] as const)(
    "round-trips focus %s and original rule snapshot",
    (focus) => {
      const storage = memoryStorage();
      const result = review();
      const saved = saveReview(storage, result, focus);
      expect(saved.version).toBe(1);
      expect(Number.isFinite(Date.parse(saved.savedAt))).toBe(true);
      expect(loadReview(storage)).toEqual(saved);
    },
  );
  it("isolates saved data from later edits to rules, findings and executions", () => {
    const storage = memoryStorage();
    const result = review();
    const saved = saveReview(storage, result, "daily-limit");
    result.rules.maxPositions = 10;
    result.findings[0].status = "deviated";
    result.session.positions[0].executions[0].timestamp = null;
    expect(saved.review.rules.maxPositions).toBe(3);
    expect(saved.review.findings[0].status).toBe("followed");
    expect(
      saved.review.session.positions[0].executions[0].timestamp,
    ).not.toBeNull();
    expect(loadReview(storage)).toEqual(saved);
  });
  it("recomputes findings on load rather than trusting stored narrative", () => {
    const storage = memoryStorage();
    const saved = saveReview(storage, review(), "later");
    saved.review.findings = [];
    storage.setItem(STORAGE_KEY, JSON.stringify(saved));
    const loaded = loadReview(storage)!;
    expect(loaded.review.findings).toHaveLength(8);
    expect(
      loaded.review.findings.filter((f) => f.status === "deviated"),
    ).toHaveLength(2);
  });
  it("returns null for empty, corrupt or denied reads", () => {
    expect(loadReview(memoryStorage())).toBeNull();
    expect(loadReview({ getItem: () => "{" })).toBeNull();
    expect(
      loadReview({
        getItem: () => {
          throw new DOMException("Denied", "SecurityError");
        },
      }),
    ).toBeNull();
  });
  it.each([
    (s: SavedReview) => {
      s.version = 2 as 1;
    },
    (s: SavedReview) => {
      s.focus = "unknown" as "later";
    },
    (s: SavedReview) => {
      s.savedAt = "not-a-date";
    },
    (s: SavedReview) => {
      s.review.rules.maxPositions = 0;
    },
    (s: SavedReview) => {
      s.review.rules.cutoff = "24:00";
    },
    (s: SavedReview) => {
      s.review.rules.id = "";
    },
    (s: SavedReview) => {
      s.review.session.recordsComplete = "yes" as unknown as boolean;
    },
    (s: SavedReview) => {
      s.review.session.positions = null as unknown as [];
    },
    (s: SavedReview) => {
      s.review.session.positions[0].executions = null as unknown as [];
    },
  ])("rejects malformed persisted input %#", (mutate) => {
    const storage = memoryStorage();
    const saved = saveReview(storage, review(), "later");
    mutate(saved);
    storage.setItem(STORAGE_KEY, JSON.stringify(saved));
    expect(loadReview(storage)).toBeNull();
  });
  it("propagates denied writes so the caller can show unsaved state", () => {
    expect(() =>
      saveReview(
        {
          setItem: () => {
            throw new DOMException("Quota exceeded", "QuotaExceededError");
          },
        },
        review(),
        "later",
      ),
    ).toThrow();
  });
});

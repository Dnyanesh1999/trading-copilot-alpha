import type { Focus, Review, SavedReview } from "./types";
import { reviewSession, validRules } from "./review";
export const STORAGE_KEY = "trading-copilot-alpha.review.v1";
export function saveReview(
  storage: Pick<Storage, "setItem">,
  review: Review,
  focus: Focus,
  selectedPositionId?: string,
): SavedReview {
  const saved: SavedReview = {
    ...(selectedPositionId ? { selectedPositionId } : {}),
    version: 1,
    savedAt: new Date().toISOString(),
    focus,
    review: structuredClone(review),
  };
  storage.setItem(STORAGE_KEY, JSON.stringify(saved));
  return saved;
}
export function loadReview(
  storage: Pick<Storage, "getItem">,
): SavedReview | null {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SavedReview;
    if (
      data.version !== 1 ||
      !["entry-check", "daily-limit", "risk-plan", "later"].includes(
        data.focus,
      ) ||
      !Number.isFinite(Date.parse(data.savedAt)) ||
      !data.review ||
      !validRules(data.review.rules.maxPositions, data.review.rules.cutoff) ||
      !Array.isArray(data.review.session.positions) ||
      typeof data.review.session.recordsComplete !== "boolean"
    )
      return null;
    // Validate persisted inputs and recompute findings rather than trusting a stale narrative.
    const computed = reviewSession(data.review.rules, data.review.session);
    return { ...data, review: computed };
  } catch {
    return null;
  }
}

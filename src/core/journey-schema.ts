import type { JourneyEvent } from "./journey";
export const MAX_BATCH = 50;
export const MAX_BODY_BYTES = 32768;
const stages = new Set(["welcome", "rules", "session", "complete"]);
const actions = new Set([
  "rules_confirmed",
  "position_selected",
  "evidence_opened",
  "focus_saved",
  "saved_review_opened",
  "reset",
  "save_failed",
  "example_changed",
  "session_started",
  "stage_entered",
  "visible_interval",
  "stage_left",
  "session_ended",
]);
const keys = [
  "version",
  "build",
  "mode",
  "eventId",
  "sessionId",
  "sequence",
  "at",
  "type",
  "stage",
];
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
export function validateEvent(value: unknown): JourneyEvent | null {
  if (!isRecord(value)) return null;
  const expected =
    value.type === "visible_interval" ? [...keys, "durationMs"] : keys;
  if (
    Object.keys(value).length !== expected.length ||
    !expected.every((k) => Object.hasOwn(value, k))
  )
    return null;
  if (
    value.version !== 1 ||
    value.build !== "internal-journey-v1" ||
    value.mode !== "internal"
  )
    return null;
  if (
    typeof value.eventId !== "string" ||
    !uuid.test(value.eventId) ||
    typeof value.sessionId !== "string" ||
    !uuid.test(value.sessionId)
  )
    return null;
  if (!Number.isSafeInteger(value.sequence) || (value.sequence as number) < 1)
    return null;
  if (
    typeof value.at !== "string" ||
    !Number.isFinite(Date.parse(value.at)) ||
    new Date(value.at).toISOString() !== value.at
  )
    return null;
  if (
    typeof value.type !== "string" ||
    !actions.has(value.type) ||
    typeof value.stage !== "string" ||
    !stages.has(value.stage)
  )
    return null;
  if (
    value.type === "visible_interval" &&
    (!Number.isSafeInteger(value.durationMs) ||
      (value.durationMs as number) < 0)
  )
    return null;
  // Rebuild in a canonical order so retries with reordered JSON keys stay idempotent.
  return {
    version: 1,
    build: "internal-journey-v1",
    mode: "internal",
    eventId: value.eventId,
    sessionId: value.sessionId,
    sequence: value.sequence as number,
    at: value.at,
    type: value.type as JourneyEvent["type"],
    stage: value.stage as JourneyEvent["stage"],
    ...(value.type === "visible_interval"
      ? { durationMs: value.durationMs as number }
      : {}),
  };
}
export function validateBatch(value: unknown): JourneyEvent[] | null {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 1 ||
    !Array.isArray(value.events) ||
    value.events.length < 1 ||
    value.events.length > MAX_BATCH
  )
    return null;
  const events = value.events.map(validateEvent);
  return events.every((event): event is JourneyEvent => event !== null)
    ? events
    : null;
}

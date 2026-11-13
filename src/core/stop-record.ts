import type { Position } from "./types";

export type StopDeclaration = NonNullable<Position["stopDeclaration"]>;
export const stopDeclarations = [
  "had-stop",
  "no-stop",
  "not-recorded",
] as const;
export function stopDeclaration(position: Position): StopDeclaration {
  return (
    position.stopDeclaration ?? (position.stop ? "had-stop" : "not-recorded")
  );
}
/** Initial planned levels only. Later trailing/breakeven adjustments are not initial levels. */
export function initialLevelErrors(
  direction: "long" | "short",
  entry: number,
  stop?: number | null,
  target?: number | null,
) {
  const errors: { stop?: string; target?: string } = {};
  if (
    stop != null &&
    (!Number.isFinite(stop) ||
      stop <= 0 ||
      (direction === "long" ? stop >= entry : stop <= entry))
  )
    errors.stop = `Initial ${direction} stop must be ${direction === "long" ? "below" : "above"} entry (${entry}). Later trailing/breakeven adjustments are not initial stops.`;
  if (
    target != null &&
    (!Number.isFinite(target) ||
      target <= 0 ||
      (direction === "long" ? target <= entry : target >= entry))
  )
    errors.target = `Initial ${direction} target must be ${direction === "long" ? "above" : "below"} entry (${entry}).`;
  return errors;
}

import type { Session } from "./types";
export const DEMO_NOTICE = "DEMO — fictional prices, not real market data";
// DEMO is a reserved fictional symbol, including when its CSV is uploaded again.
export function isDemoReplay(session: Session): boolean {
  return (
    !!session.historicalReplay && session.positions[0]?.instrument === "DEMO"
  );
}

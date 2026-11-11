import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import type { DailyBar } from "./types";

/** UTF-8, fixed header/order, JS decimal numbers, blank absent volume, LF + final LF.
 * Input order is chronological and is validated by the replay/restore boundary.
 */
export function canonicalReplayCsv(bars: DailyBar[]): string {
  return (
    "date,open,high,low,close,volume\n" +
    bars
      .map(({ date, open, high, low, close, volume }) =>
        [date, open, high, low, close, volume ?? ""].join(","),
      )
      .join("\n") +
    "\n"
  );
}

export async function hashReplayBars(bars: DailyBar[]): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonicalReplayCsv(bars)),
  );
  return bytesToHex(new Uint8Array(digest));
}

/** Saved-review and Worker callers require synchronous validation. */
export function verifyReplayHash(bars: DailyBar[], expected: string): boolean {
  return (
    bytesToHex(sha256(new TextEncoder().encode(canonicalReplayCsv(bars)))) ===
    expected
  );
}

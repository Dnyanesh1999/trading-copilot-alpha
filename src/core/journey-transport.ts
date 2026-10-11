import type { JourneyEvent } from "./journey";
import { isRecord, MAX_BATCH, validateEvent } from "./journey-schema";
export const OUTBOX_KEY = "trading-copilot:internal-outbox:v1";
const MAX_QUEUED = 2000;
type Store = Pick<Storage, "getItem" | "setItem">;
export type DeliveryStatus = {
  pending: number;
  delivered: number;
  dropped: number;
  issue: "none" | "offline" | "rejected" | "storage" | "corrupt";
  sending: boolean;
};
export function createJourneyTransport(
  storage: Store | null,
  send: typeof fetch = fetch,
  now = () => Date.now(),
) {
  let queue: JourneyEvent[] = [];
  let delivered = 0,
    dropped = 0,
    failures = 0,
    retryAt = 0;
  let sending = false,
    permanentFailure = false;
  let issue: DeliveryStatus["issue"] = "none";
  const listeners = new Set<() => void>();
  try {
    if (!storage) throw new Error("storage unavailable");
    const raw = storage.getItem(OUTBOX_KEY);
    if (raw !== null) {
      const saved: unknown = JSON.parse(raw);
      if (
        !isRecord(saved) ||
        saved.version !== 1 ||
        !Array.isArray(saved.events) ||
        saved.events.length > MAX_QUEUED ||
        !Number.isSafeInteger(saved.dropped) ||
        (saved.dropped as number) < 0 ||
        Object.keys(saved).length !== 3
      )
        throw new Error("corrupt");
      const events = saved.events.map(validateEvent);
      if (
        events.some((e) => e === null) ||
        new Set(events.map((e) => e?.eventId)).size !== events.length
      )
        throw new Error("corrupt");
      queue = events as JourneyEvent[];
      dropped = saved.dropped as number;
    }
  } catch {
    issue = storage ? "corrupt" : "storage";
    permanentFailure = !!storage;
  }
  let snapshot: DeliveryStatus = {
    pending: queue.length,
    delivered,
    dropped,
    issue,
    sending,
  };
  function notify() {
    snapshot = { pending: queue.length, delivered, dropped, issue, sending };
    listeners.forEach((listener) => listener());
  }
  function persist() {
    try {
      if (!storage) throw new Error("storage unavailable");
      storage.setItem(
        OUTBOX_KEY,
        JSON.stringify({ version: 1, events: queue, dropped }),
      );
      if (issue === "storage") issue = "none";
    } catch {
      issue = "storage";
    }
  }
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    snapshot: () => snapshot,
    enqueue(event: JourneyEvent) {
      if (issue === "corrupt" || queue.length >= MAX_QUEUED) {
        dropped++;
        if (!permanentFailure) persist();
        notify();
        return;
      }
      const checked = validateEvent(event);
      if (!checked) {
        issue = "rejected";
        dropped++;
        notify();
        return;
      }
      if (queue.some((e) => e.eventId === checked.eventId)) return;
      queue.push(checked);
      persist();
      notify();
    },
    async flush(force = false) {
      if (
        sending ||
        (permanentFailure && (!force || issue === "corrupt")) ||
        !queue.length ||
        (!force && now() < retryAt)
      )
        return;
      if (force) permanentFailure = false;
      const batch = queue.slice(0, MAX_BATCH);
      sending = true;
      notify();
      try {
        const response = await send("/internal-api/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ events: batch }),
          signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) {
          if (
            response.status >= 400 &&
            response.status < 500 &&
            response.status !== 408 &&
            response.status !== 429
          ) {
            issue = "rejected";
            permanentFailure = true;
          }
          throw new Error("delivery failed");
        }
        const result: unknown = await response.json();
        if (
          !isRecord(result) ||
          !Array.isArray(result.acceptedEventIds) ||
          result.acceptedEventIds.length !== batch.length ||
          !batch.every((e) =>
            (result.acceptedEventIds as unknown[]).includes(e.eventId),
          )
        )
          throw new Error("invalid acknowledgement");
        const accepted = new Set(batch.map((e) => e.eventId));
        queue = queue.filter((e) => !accepted.has(e.eventId));
        delivered += accepted.size;
        failures = 0;
        retryAt = 0;
        issue = "none";
        persist();
      } catch {
        if (!permanentFailure) issue = "offline";
        failures++;
        retryAt =
          now() + Math.min(60000, 2000 * 2 ** Math.min(failures - 1, 5));
      } finally {
        sending = false;
        notify();
      }
    },
  };
}

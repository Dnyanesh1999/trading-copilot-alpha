import { describe, expect, it, vi } from "vitest";
import { createJourneyTransport, OUTBOX_KEY } from "./journey-transport";
import type { JourneyEvent } from "./journey";
const event = (sequence = 1): JourneyEvent => ({
  version: 1,
  build: "internal-journey-v1",
  mode: "internal",
  eventId: crypto.randomUUID(),
  sessionId: "b66a2a56-2bb0-4b55-8297-e03e3a4a6666",
  sequence,
  at: "2026-10-11T12:00:00.000Z",
  type: "session_started",
  stage: "rules",
});
const store = () => {
  const values = new Map<string, string>();
  return {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => {
      values.set(k, v);
    },
  };
};
const accept = async (_url: unknown, init?: RequestInit) =>
  Response.json({
    acceptedEventIds: JSON.parse(String(init?.body)).events.map(
      (e: JourneyEvent) => e.eventId,
    ),
  });
describe("internal delivery outbox", () => {
  it("survives reload and only removes acknowledged records", async () => {
    const storage = store();
    const first = createJourneyTransport(storage);
    first.enqueue(event());
    const second = createJourneyTransport(storage, accept as typeof fetch);
    expect(second.snapshot().pending).toBe(1);
    await second.flush();
    expect(second.snapshot().pending).toBe(0);
    expect(createJourneyTransport(storage).snapshot().pending).toBe(0);
  });
  it("backs off after an outage and retries identical event IDs", async () => {
    let time = 0;
    const send = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockImplementation(accept);
    const log = createJourneyTransport(store(), send, () => time);
    const original = event();
    log.enqueue(original);
    await log.flush();
    expect(log.snapshot().pending).toBe(1);
    await log.flush();
    expect(send).toHaveBeenCalledTimes(1);
    time = 2000;
    await log.flush();
    expect(log.snapshot().delivered).toBe(1);
    expect(JSON.parse(send.mock.calls[0][1].body).events[0].eventId).toBe(
      JSON.parse(send.mock.calls[1][1].body).events[0].eventId,
    );
  });
  it("retains a batch if an acknowledgement is incomplete", async () => {
    const log = createJourneyTransport(store(), async () =>
      Response.json({ acceptedEventIds: [] }),
    );
    log.enqueue(event());
    await log.flush();
    expect(log.snapshot().pending).toBe(1);
  });
  it("never loses new arrivals while a batch is in flight", async () => {
    let resolve!: (response: Response) => void;
    const send = vi.fn(
      () =>
        new Promise<Response>((r) => {
          resolve = r;
        }),
    );
    const log = createJourneyTransport(store(), send);
    const first = event();
    log.enqueue(first);
    const pending = log.flush();
    log.enqueue(event(2));
    await log.flush();
    expect(send).toHaveBeenCalledTimes(1);
    resolve(Response.json({ acceptedEventIds: [first.eventId] }));
    await pending;
    expect(log.snapshot().pending).toBe(1);
  });
  it("preserves invalid stored queues instead of silently erasing them", async () => {
    const storage = store();
    storage.setItem(OUTBOX_KEY, "broken");
    const send = vi.fn();
    const log = createJourneyTransport(storage, send);
    log.enqueue(event());
    await log.flush();
    expect(log.snapshot().issue).toBe("corrupt");
    expect(send).not.toHaveBeenCalled();
    expect(storage.getItem(OUTBOX_KEY)).toBe("broken");
  });
  it("surfaces storage failures without breaking the review", () => {
    const log = createJourneyTransport(null);
    expect(() => log.enqueue(event())).not.toThrow();
    expect(log.snapshot().issue).toBe("storage");
    expect(log.snapshot().pending).toBe(1);
  });
  it("pauses automatic retries after rejection and allows explicit recovery", async () => {
    const send = vi.fn(async () => new Response(null, { status: 409 }));
    const log = createJourneyTransport(store(), send);
    log.enqueue(event());
    await log.flush();
    await log.flush();
    expect(send).toHaveBeenCalledTimes(1);
    expect(log.snapshot().pending).toBe(1);
    expect(log.snapshot().issue).toBe("rejected");
    log.enqueue(event(2));
    expect(log.snapshot().pending).toBe(2);
    await log.flush(true);
    expect(send).toHaveBeenCalledTimes(2);
  });
  it("bounds request batches and exposes overflow rather than claiming success", async () => {
    const send = vi.fn(accept);
    const log = createJourneyTransport(null, send as typeof fetch);
    for (let i = 0; i < 2001; i++) log.enqueue(event(i + 1));
    expect(log.snapshot().dropped).toBe(1);
    await log.flush();
    expect(JSON.parse(String(send.mock.calls[0][1]?.body)).events).toHaveLength(
      50,
    );
    expect(log.snapshot().pending).toBe(1950);
  });
});

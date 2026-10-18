import { afterEach, expect, it, vi } from "vitest";
import { validateStudyEvent, validateFinish, ratingIds, csv } from "./protocol";
import { defaultStrategy } from "../core/workspace";
const event = {
  eventId: "12345678-1234-4234-8234-123456789012",
  sequence: 1,
  at: "2026-10-18T09:00:00.000Z",
  type: "task_started",
  taskId: "rules",
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it("rejects raw fields and impossible event counters", () => {
  expect(validateStudyEvent(event)).not.toBeNull();
  expect(validateStudyEvent({ ...event, strategy: "private" })).toBeNull();
  expect(
    validateStudyEvent({ ...event, type: "visible_interval", durationMs: -1 }),
  ).toBeNull();
  expect(
    validateStudyEvent({
      ...event,
      type: "ai_outcomes",
      counts: [3, 1, 1, 1, 0],
    }),
  ).not.toBeNull();
  expect(
    validateStudyEvent({
      ...event,
      type: "ai_outcomes",
      counts: [3, 2, 2, 0, 0],
    }),
  ).toBeNull();
});
it("keeps skipped answers unknown and rejects identifier-like comments", () => {
  const response = {
    ratings: Object.fromEntries(ratingIds.map((id) => [id, null])),
    assessments: ["strategy", "rules", "review", "action"].map((taskId) => ({
      taskId,
      completed: "partly",
      neededHelp: null,
    })),
    comment: "R was confusing",
    theme: "clarity",
    noIdentifiers: true,
  };
  expect(validateFinish(response)).toBe(true);
  expect(
    validateFinish({ ...response, ratings: { ...response.ratings, SUS01: 0 } }),
  ).toBe(false);
  expect(
    validateFinish({ ...response, comment: "email@example.invalid" }),
  ).toBe(false);
  expect(validateFinish({ ...response, noIdentifiers: false })).toBe(false);
});
it("quotes CSV and neutralises spreadsheet formulas", () => {
  expect(
    csv([{ quote: "=2+2", notes: 'one, "two"' }], ["quote", "notes"]),
  ).toContain('"\'=2+2","one, ""two"""');
});
async function client() {
  vi.resetModules();
  const memory = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (k: string) => memory.get(k) ?? null,
    setItem: (k: string, v: string) => memory.set(k, v),
    removeItem: (k: string) => memory.delete(k),
  });
  vi.stubGlobal("document", { hidden: false });
  const { study, studyWorkspace } = await import("./client");
  return { study, studyWorkspace, memory };
}
it("records nothing before consented begin and isolates study workspace", async () => {
  const { study, studyWorkspace, memory } = await client();
  study.start("rules");
  study.event("evidence_opened", "review");
  expect(memory.size).toBe(0);
  expect(studyWorkspace()).toBeNull();
  study.begin({
    sessionId: "synthetic-session",
    participantId: "DEMO99",
    sessionToken: "synthetic-test-token",
    mode: "rehearsal",
  });
  expect(studyWorkspace()?.key).toBe(
    "trading-copilot.study-workspace.synthetic-session",
  );
  expect(study.snapshot().pending).toBe(0);
});
it("compares final AI proposals to confirmed rules without storing their text or values", async () => {
  const { study, memory } = await client();
  study.begin({
    sessionId: "synthetic-session",
    participantId: "DEMO99",
    sessionToken: "synthetic-test-token",
    mode: "rehearsal",
  });
  study.proposals({
    rules: [
      { ruleId: "planned-risk", value: 500 },
      { ruleId: "reward-risk", value: 2 },
      { ruleId: "stop-before-entry", value: true },
    ],
    questions: [],
    unsupported: [],
    model: "test-model",
  });
  study.outcomes({
    ...defaultStrategy,
    enabledRules: ["planned-risk", "stop-before-entry", "daily-limit"],
    maxRisk: 600,
  });
  const stored = JSON.parse(memory.get("trading-copilot.study-session.v1")!);
  expect(
    stored.events.find((e: { type: string }) => e.type === "ai_outcomes")
      .counts,
  ).toEqual([3, 1, 1, 1, 1]);
  expect(JSON.stringify(stored.events)).not.toContain("planned-risk");
});

it("waits for an in-flight save instead of reporting a false failure", async () => {
  const { study } = await client();
  study.begin({
    sessionId: "synthetic-session",
    participantId: "DEMO99",
    sessionToken: "synthetic-test-token",
    mode: "rehearsal",
  });
  study.start("review");
  let acknowledge!: () => void;
  const fetcher = vi.fn(
    (_url: string, init: RequestInit) =>
      new Promise<Response>((resolve) => {
        const events = JSON.parse(init.body as string).events;
        acknowledge = () =>
          resolve(
            Response.json({
              acceptedEventIds: events.map(
                (e: { eventId: string }) => e.eventId,
              ),
            }),
          );
      }),
  );
  vi.stubGlobal("fetch", fetcher);
  const background = study.flush();
  const finishing = study.flush();
  acknowledge();
  expect(await background).toBe(true);
  expect(await finishing).toBe(true);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(study.snapshot().pending).toBe(0);
});

it("excludes questionnaire time after task recording is suspended", async () => {
  const { study, memory } = await client();
  let now = 0;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  study.begin({
    sessionId: "synthetic-session",
    participantId: "DEMO99",
    sessionToken: "synthetic-test-token",
    mode: "rehearsal",
  });
  study.start("action");
  now = 2000;
  study.suspend();
  now = 90000;
  study.checkpoint();
  const events = JSON.parse(
    memory.get("trading-copilot.study-session.v1")!,
  ).events;
  expect(
    events
      .filter((e: { type: string }) => e.type === "visible_interval")
      .map((e: { durationMs: number }) => e.durationMs),
  ).toEqual([2000]);
  expect(study.snapshot().activeTask).toBeNull();
});

it("clears only the departing session workspace and questionnaire", async () => {
  const { study, memory } = await client();
  study.begin({
    sessionId: "synthetic-session",
    participantId: "DEMO99",
    sessionToken: "synthetic-test-token",
    mode: "rehearsal",
  });
  memory.set("trading-copilot.study-workspace.synthetic-session", "workspace");
  memory.set(
    "trading-copilot.study-questionnaire.synthetic-session",
    "answers",
  );
  memory.set("unrelated-owner-record", "keep");
  study.clear();
  expect([...memory.entries()]).toEqual([["unrelated-owner-record", "keep"]]);
});

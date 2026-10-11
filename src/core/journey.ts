export type Stage = "welcome" | "rules" | "session" | "complete";
export type Action =
  | "rules_confirmed"
  | "position_selected"
  | "evidence_opened"
  | "focus_saved"
  | "saved_review_opened"
  | "reset"
  | "save_failed"
  | "example_changed";
export type JourneyEvent = {
  version: 1;
  build: "internal-journey-v1";
  mode: "internal";
  eventId: string;
  sessionId: string;
  sequence: number;
  at: string;
  type:
    | Action
    | "session_started"
    | "stage_entered"
    | "visible_interval"
    | "stage_left"
    | "session_ended";
  stage: Stage;
  durationMs?: number;
};
// Closed payload: no strategy, rule values, trade identifiers or arbitrary text.
export function createJourney(
  enabled: boolean,
  clock = () => performance.now(),
  wall = () => new Date().toISOString(),
  id: () => string = () => crypto.randomUUID(),
  onEvent?: (event: JourneyEvent) => void,
) {
  const events: JourneyEvent[] = [];
  let sessionId: string | null = null;
  let stage: Stage = "welcome";
  let visible = true;
  let since: number | null = null;
  let sequence = 0;
  let dropped = 0;
  let completed = false;
  function emit(type: JourneyEvent["type"], durationMs?: number) {
    if (!enabled || !sessionId) return;
    if (events.length >= 10000) {
      dropped++;
      return;
    }
    const event: JourneyEvent = {
      version: 1,
      build: "internal-journey-v1",
      mode: "internal",
      eventId: id(),
      sessionId,
      sequence: ++sequence,
      at: wall(),
      type,
      stage,
      ...(durationMs === undefined ? {} : { durationMs }),
    };
    events.push(event);
    // Logging must never interrupt the review when a delivery adapter fails.
    try {
      onEvent?.({ ...event });
    } catch {
      dropped++;
    }
  }
  function flush() {
    if (since === null) return;
    emit("visible_interval", Math.max(0, Math.round(clock() - since)));
    since = null;
  }
  function end() {
    if (!sessionId) return;
    flush();
    emit("stage_left");
    emit("session_ended");
    sessionId = null;
  }
  return {
    start(initial: Stage, review = true) {
      if (!enabled) return;
      end();
      sessionId = id();
      sequence = 0;
      completed = !review;
      stage = initial;
      if (review) emit("session_started");
      else emit("saved_review_opened");
      emit("stage_entered");
      since = visible ? clock() : null;
    },
    stage(next: Stage) {
      if (!sessionId || next === stage) return;
      flush();
      emit("stage_left");
      stage = next;
      emit("stage_entered");
      since = visible ? clock() : null;
    },
    action(action: Action) {
      if (action === "focus_saved") {
        if (completed) return;
        completed = true;
      }
      emit(action);
    },
    visibility(next: boolean) {
      if (next === visible) return;
      flush();
      visible = next;
      since = sessionId && visible ? clock() : null;
    },
    end,
    export() {
      flush();
      since = sessionId && visible ? clock() : null;
      return {
        schemaVersion: 1,
        mode: "internal",
        droppedEvents: dropped,
        events: events.map((e) => ({ ...e })),
      };
    },
  };
}

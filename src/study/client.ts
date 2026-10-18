import type { StrategyAnalysis } from "../core/strategy-ai";
import type { StrategyDraft } from "../core/workspace";
import {
  type StudyEvent,
  type TaskId,
  type FinishData,
  taskIds,
} from "./protocol";
export type StudySession = {
  sessionId: string;
  participantId: string;
  sessionToken: string;
  mode: "rehearsal" | "participant";
};
type Saved = {
  session: StudySession;
  events: StudyEvent[];
  sequence: number;
  completed: TaskId[];
};
const KEY = "trading-copilot.study-session.v1";
let saved: Saved | null = null;
try {
  const s = JSON.parse(sessionStorage.getItem(KEY) ?? "null");
  if (
    s?.session?.sessionId &&
    s?.session?.sessionToken &&
    Array.isArray(s.events) &&
    Number.isInteger(s.sequence) &&
    Array.isArray(s.completed)
  )
    saved = s;
} catch {}
let activeTask: TaskId | null = null,
  since: number | null = null,
  paused = false,
  issue = "",
  proposal: StrategyAnalysis | null = null;
let sending: Promise<boolean> | null = null;
const listeners = new Set<() => void>();
let snapshot: {
  session: StudySession | null;
  pending: number;
  completed: TaskId[];
  issue: string;
  activeTask: TaskId | null;
} = {
  session: saved?.session ?? null,
  pending: saved?.events.length ?? 0,
  completed: saved?.completed ?? ([] as TaskId[]),
  issue,
  activeTask,
};
function changed() {
  snapshot = {
    session: saved?.session ?? null,
    pending: saved?.events.length ?? 0,
    completed: [...(saved?.completed ?? [])],
    issue,
    activeTask,
  };
  listeners.forEach((fn) => fn());
}
function persist() {
  try {
    if (saved) sessionStorage.setItem(KEY, JSON.stringify(saved));
    else sessionStorage.removeItem(KEY);
  } catch {
    issue =
      "Browser storage is unavailable. Keep this tab open; this session cannot safely resume after a reload.";
  }
  changed();
}
export const study = {
  subscribe: (fn: () => void) => {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
  snapshot: () => snapshot,
  session: () => saved?.session ?? null,
  async request(path: string, body?: unknown) {
    const response = await fetch("/study-api" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        ...(saved
          ? { Authorization: `Bearer ${saved.session.sessionToken}` }
          : {}),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(10000),
    });
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.error ?? "Study service is unavailable.");
    return data;
  },
  begin(session: StudySession) {
    saved = { session, events: [], sequence: 0, completed: [] };
    paused = false;
    issue = "";
    activeTask = null;
    since = null;
    proposal = null;
    persist();
  },
  event(
    type: StudyEvent["type"],
    taskId: TaskId,
    extra: Partial<Pick<StudyEvent, "durationMs" | "counts">> = {},
  ) {
    if (!saved || paused) return;
    if (saved.events.length >= 2000) {
      issue = "The recording queue is full. Reconnect before continuing.";
      changed();
      return;
    }
    saved.events.push({
      eventId: crypto.randomUUID(),
      sequence: ++saved.sequence,
      at: new Date().toISOString(),
      type,
      taskId,
      ...extra,
    });
    persist();
  },
  checkpoint() {
    if (saved && !paused && activeTask && since !== null) {
      const durationMs = Math.round(Math.max(0, performance.now() - since));
      since = document.hidden ? null : performance.now();
      if (durationMs > 0)
        study.event("visible_interval", activeTask, {
          durationMs: Math.min(durationMs, 3600000),
        });
    }
  },
  start(taskId: TaskId) {
    if (!saved || paused) return;
    if (activeTask === taskId) {
      if (since === null && !document.hidden) since = performance.now();
      return;
    }
    study.checkpoint();
    activeTask = taskId;
    since = document.hidden ? null : performance.now();
    study.event("task_started", taskId);
  },
  complete(taskId: TaskId) {
    if (!saved || paused) return;
    study.checkpoint();
    if (!saved.completed.includes(taskId)) {
      saved.completed.push(taskId);
      study.event("task_completed", taskId);
    }
    persist();
  },
  evidence() {
    study.start("review");
    study.event("evidence_opened", "review");
    study.complete("review");
  },
  proposals(result: StrategyAnalysis) {
    proposal = structuredClone(result);
    study.event("ai_proposals", "strategy", {
      counts: [result.rules.length, result.questions.length],
    });
    study.complete("strategy");
    study.start("rules");
  },
  outcomes(draft: StrategyDraft) {
    if (!proposal) return;
    let accepted = 0,
      edited = 0,
      removed = 0,
      added = 0;
    const known = proposal.rules.filter((r) => r.value !== null);
    const value = (id: string) =>
      id === "daily-limit"
        ? draft.maxPositions
        : id === "entry-cutoff"
          ? draft.cutoff
          : id === "planned-risk"
            ? draft.maxRisk
            : id === "reward-risk"
              ? draft.minRewardRisk
              : draft.enabledRules.includes("stop-before-entry");
    for (const r of known) {
      if (
        r.ruleId === "stop-before-entry" &&
        r.value === false &&
        !draft.enabledRules.includes(r.ruleId)
      ) {
        accepted++;
        continue;
      }
      if (!draft.enabledRules.includes(r.ruleId)) {
        removed++;
        continue;
      }
      if (value(r.ruleId) === r.value) accepted++;
      else edited++;
    }
    for (const id of draft.enabledRules)
      if (!known.some((r) => r.ruleId === id)) added++;
    study.event("ai_outcomes", "rules", {
      counts: [known.length, accepted, edited, removed, added],
    });
  },
  async flush(): Promise<boolean> {
    if (sending) return sending;
    if (!saved) return true;
    if (!saved.events.length) return true;
    sending = (async () => {
      try {
        while (saved && saved.events.length) {
          const batch = saved.events.slice(0, 50);
          const result = await study.request("/events", { events: batch });
          if (
            !Array.isArray(result.acceptedEventIds) ||
            !batch.every((e) => result.acceptedEventIds.includes(e.eventId))
          )
            throw new Error(
              "Recording acknowledgement is incomplete. Retry before ending.",
            );
          const ids = new Set(batch.map((e) => e.eventId));
          saved.events = saved.events.filter((e) => !ids.has(e.eventId));
          issue = "";
          persist();
        }
        return true;
      } catch (e) {
        issue =
          e instanceof Error
            ? e.message
            : "Recording is offline. Keep this tab open and retry.";
        changed();
        return false;
      } finally {
        sending = null;
      }
    })();
    return sending;
  },
  suspend() {
    study.checkpoint();
    since = null;
    activeTask = null;
    changed();
  },
  async finish(data: FinishData) {
    study.checkpoint();
    paused = true;
    changed();
    if (!(await study.flush())) {
      paused = false;
      throw new Error(
        "Some activity is not stored yet. Keep this tab open and retry.",
      );
    }
    try {
      await study.request("/finish", data);
    } catch (e) {
      paused = false;
      throw e;
    }
  },
  async stop() {
    study.checkpoint();
    paused = true;
    if (!(await study.flush())) {
      paused = false;
      throw new Error(
        "Some activity is not stored yet. Reconnect and retry stopping this session.",
      );
    }
    try {
      await study.request("/stop", {});
    } catch (e) {
      paused = false;
      throw e;
    }
  },
  clear() {
    const id = saved?.session.sessionId;
    if (id) {
      sessionStorage.removeItem("trading-copilot.study-workspace." + id);
      sessionStorage.removeItem(
        "trading-copilot.study-workspace." + id + ".manual-trades",
      );
      sessionStorage.removeItem("trading-copilot.study-questionnaire." + id);
    }
    saved = null;
    paused = false;
    activeTask = null;
    since = null;
    proposal = null;
    persist();
  },
  resume() {
    paused = false;
    since = null;
    activeTask = null;
    changed();
  },
};
export function studyWorkspace() {
  const s = study.session();
  return s
    ? {
        store: sessionStorage,
        key: "trading-copilot.study-workspace." + s.sessionId,
      }
    : null;
}
export function startStudyRecording() {
  const visibility = () => {
    if (document.hidden) study.checkpoint();
    else if (activeTask && !paused) since = performance.now();
    void study.flush();
  };
  const checkpoint = () => {
    study.checkpoint();
    void study.flush();
  };
  const timer = window.setInterval(checkpoint, 3000);
  document.addEventListener("visibilitychange", visibility);
  window.addEventListener("online", checkpoint);
  window.addEventListener("pagehide", checkpoint);
  return () => {
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", visibility);
    window.removeEventListener("online", checkpoint);
    window.removeEventListener("pagehide", checkpoint);
  };
}
export function defaultAssessments() {
  return taskIds.map((taskId) => ({
    taskId,
    completed: (saved?.completed.includes(taskId) ? "yes" : "no") as
      "yes" | "partly" | "no",
    neededHelp: null as "yes" | "no" | null,
  }));
}

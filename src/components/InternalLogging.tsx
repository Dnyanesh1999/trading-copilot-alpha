import { useSyncExternalStore } from "react";
import type { createJourneyTransport } from "../core/journey-transport";
type Transport = ReturnType<typeof createJourneyTransport>;
export function InternalLogging({
  transport,
  onExport,
}: {
  transport: Transport;
  onExport: () => void;
}) {
  const state = useSyncExternalStore(transport.subscribe, transport.snapshot);
  const issues = {
    none: "",
    offline: "Backend unavailable. Pending events will retry.",
    rejected: "Delivery rejected. Queue retained; inspect before continuing.",
    storage:
      "Browser queue storage unavailable. Pending events may be lost on reload.",
    corrupt:
      "Stored queue is invalid. Collection paused; preserve it for inspection.",
  };
  return (
    <aside aria-label="Internal logging" className="internal-logging">
      <strong>Internal test · local backend</strong>
      <span role="status">
        {state.pending} pending · {state.delivered} acknowledged this page ·{" "}
        {state.dropped} dropped{state.sending ? " · sending" : ""}
      </span>
      <span>
        Pending queue survives reload in this tab. Closing the tab can lose
        unsent events.
      </span>
      {state.issue !== "none" && (
        <span role="alert">{issues[state.issue]}</span>
      )}
      <button onClick={() => void transport.flush(true)}>
        Retry pending events
      </button>
      <button onClick={onExport}>Export this page’s events</button>
    </aside>
  );
}

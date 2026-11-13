import { useEffect } from "react";
import { createJourney, type Stage } from "../core/journey";
import { createJourneyTransport } from "../core/journey-transport";
import { InternalLogging } from "../components/InternalLogging";
import { downloadJson } from "./persistence";
const enabled =
  import.meta.env.DEV &&
  new URLSearchParams(location.search).get("internalLogging") === "1";
function storage() {
  try {
    return sessionStorage;
  } catch {
    return null;
  }
}
const transport = enabled ? createJourneyTransport(storage()) : null;
export const workspaceJourney = createJourney(
  enabled,
  undefined,
  undefined,
  undefined,
  transport?.enqueue,
);
export function trackPage(page: string) {
  const stage: Stage =
    page === "overview"
      ? "welcome"
      : page === "strategy"
        ? "rules"
        : page === "history"
          ? "complete"
          : "session";
  if (page === "overview") workspaceJourney.end();
  else {
    workspaceJourney.stage(stage);
  }
}
export function InternalJourney() {
  useEffect(() => {
    if (!transport) return;
    const visibility = () =>
      workspaceJourney.visibility(document.visibilityState === "visible");
    const flush = () => {
      workspaceJourney.export();
      void transport.flush();
    };
    const end = () => {
      workspaceJourney.end();
      void transport.flush();
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", end);
    window.addEventListener("online", flush);
    const timer = window.setInterval(flush, 5000);
    visibility();
    flush();
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", end);
      window.removeEventListener("online", flush);
      workspaceJourney.end();
    };
  }, []);
  return transport ? (
    <InternalLogging
      transport={transport}
      onExport={() =>
        downloadJson("internal-journey.json", workspaceJourney.export())
      }
    />
  ) : null;
}

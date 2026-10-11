import { useEffect, useMemo, useState } from "react";
import { Header, Modal } from "./components/Chrome";
import { Welcome } from "./components/Welcome";
import { Rules, type Draft } from "./components/Rules";
import { SessionReview } from "./components/SessionReview";
import { Completion } from "./components/Completion";
import { createRules, realisticSession } from "./core/fixtures";
import { reviewSession, validRules, validChecks } from "./core/review";
import { loadReview, saveReview, STORAGE_KEY } from "./core/storage";
import type { ConfirmedRules, Focus, SavedReview } from "./core/types";
import { createJourney } from "./core/journey";
import { createJourneyTransport } from "./core/journey-transport";
import { InternalLogging } from "./components/InternalLogging";
const internalLogging =
  import.meta.env.DEV &&
  new URLSearchParams(location.search).get("internalLogging") === "1";
function internalStorage() {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}
const transport = internalLogging
  ? createJourneyTransport(internalStorage())
  : null;
const journey = createJourney(
  internalLogging,
  undefined,
  undefined,
  undefined,
  transport?.enqueue,
);
function exportJourney() {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(journey.export(), null, 2)], {
      type: "application/json",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "internal-journey.json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const initialDraft: Draft = {
  maxPositions: "3",
  cutoff: "11:00",
  extraChecks: true,
  maxRisk: "500",
  minRewardRisk: "2",
};
function initialSaved() {
  try {
    return loadReview(localStorage);
  } catch {
    return null;
  }
}
export default function App() {
  const [stage, setStage] = useState<
    "welcome" | "rules" | "session" | "complete"
  >("welcome");
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const [rules, setRules] = useState<ConfirmedRules | null>(null);
  const [session, setSession] = useState(() => realisticSession());
  const [selectedId, setSelectedId] = useState("D");
  const [focus, setFocus] = useState<Focus | null>(null);
  const [saved, setSaved] = useState<SavedReview | null>(initialSaved);
  const [help, setHelp] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [error, setError] = useState("");
  const review = useMemo(
    () => (rules ? reviewSession(rules, session) : null),
    [rules, session],
  );
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    document.querySelector<HTMLElement>("main h1")?.focus();
  }, [stage]);
  useEffect(() => {
    const visibility = () =>
      journey.visibility(document.visibilityState === "visible");
    const leave = () => journey.end();
    const retry = () => {
      void transport?.flush();
    };
    // A visible checkpoint bounds lost timing if the page later crashes.
    const tick = () => {
      journey.export();
      retry();
    };
    const timer = transport ? window.setInterval(tick, 5000) : undefined;
    window.addEventListener("online", retry);
    retry();
    visibility();
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", leave);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", leave);
      journey.end();
      window.clearInterval(timer);
      window.removeEventListener("online", retry);
    };
  }, []);
  const changeStage = (next: typeof stage) => {
    setError("");
    journey.stage(next);
    if (next === "welcome") journey.end();
    setStage(next);
  };
  const confirm = () => {
    const checks = draft.extraChecks
      ? {
          stopBeforeEntry: true,
          maxRisk: Number(draft.maxRisk),
          minRewardRisk: Number(draft.minRewardRisk),
        }
      : undefined;
    if (
      !validRules(Number(draft.maxPositions), draft.cutoff) ||
      !validChecks(checks)
    ) {
      setError(
        "Choose a daily limit from 1 to 50, a valid entry time and positive risk-plan limits.",
      );
      return;
    }
    if (!checks && focus === "risk-plan") setFocus(null);
    setRules(createRules(Number(draft.maxPositions), draft.cutoff, checks));
    journey.action("rules_confirmed");
    changeStage("session");
  };
  const reset = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      setError(
        "This browser could not clear the saved review. Please allow local storage and try again.",
      );
      return;
    }
    journey.action("reset");
    setSaved(null);
    setSelectedId("D");
    setRules(null);
    setFocus(null);
    setSession(realisticSession());
    setDraft(initialDraft);
    setResetOpen(false);
    changeStage("welcome");
  };
  const save = () => {
    if (!review || !focus) return;
    try {
      setSaved(saveReview(localStorage, review, focus, selectedId));
      journey.action("focus_saved");
      changeStage("complete");
    } catch {
      journey.action("save_failed");
      setError(
        "Your browser could not save this review. Allow local storage, then try again.",
      );
    }
  };
  const openSaved = () => {
    if (!saved) return;
    setRules(saved.review.rules);
    setSelectedId(
      (saved.review.session.positions.some(
        (p) => p.id === saved.selectedPositionId,
      )
        ? saved.selectedPositionId
        : undefined) ??
        saved.review.findings.find((f) => f.status === "deviated")
          ?.positionId ??
        saved.review.session.positions[0].id,
    );
    setDraft({
      maxPositions: String(saved.review.rules.maxPositions),
      cutoff: saved.review.rules.cutoff,
      extraChecks: !!saved.review.rules.checks,
      maxRisk: String(saved.review.rules.checks?.maxRisk ?? 500),
      minRewardRisk: String(saved.review.rules.checks?.minRewardRisk ?? 2),
    });
    setSession(structuredClone(saved.review.session));
    setFocus(saved.focus);
    changeStage("complete");
  };
  return (
    <>
      {transport && (
        <InternalLogging transport={transport} onExport={exportJourney} />
      )}
      <a className="skip-link" href="#content">
        Skip to content
      </a>
      <Header
        onHome={() => changeStage("welcome")}
        onHelp={() => setHelp(true)}
        onReset={() => {
          setError("");
          setResetOpen(true);
        }}
      />
      {stage === "welcome" && (
        <Welcome
          onStart={() => {
            journey.start("rules");
            setDraft(initialDraft);
            setRules(null);
            setSelectedId("D");
            setSession(realisticSession());
            setFocus(null);
            changeStage("rules");
          }}
          onCustom={() => {
            journey.start("rules");
            changeStage("rules");
          }}
          saved={saved}
          onSaved={() => {
            journey.start("complete", false);
            openSaved();
          }}
        />
      )}
      {stage === "rules" && (
        <Rules
          draft={draft}
          onChange={setDraft}
          onConfirm={confirm}
          onBack={() => changeStage("welcome")}
          error={error}
        />
      )}
      {stage === "session" && review && (
        <SessionReview
          selectedId={selectedId}
          onSelect={(id) => {
            journey.action("position_selected");
            setSelectedId(id);
          }}
          onEvidence={() => journey.action("evidence_opened")}
          review={review}
          onExample={(mode) => {
            journey.action("example_changed");
            setSession(realisticSession(mode));
          }}
          focus={focus}
          onFocus={setFocus}
          onSave={save}
          onBack={() => changeStage("rules")}
          error={error}
        />
      )}
      {stage === "complete" && saved && (
        <Completion
          saved={saved}
          onExplore={() => {
            journey.start("rules");
            changeStage("rules");
          }}
          onBack={() => {
            openSaved();
            changeStage("session");
          }}
        />
      )}
      {help && (
        <Modal
          title="A little clarity, in three steps."
          onClose={() => setHelp(false)}
        >
          <ol className="help-list">
            <li>
              <strong>Confirm your rules.</strong> Set two entry boundaries and
              three risk-plan checks. Extra settings stay under Risk plan.
            </li>
            <li>
              <strong>Explore a session.</strong> Select any fictional position
              to see which rules it followed, where it deviated, and what
              evidence is missing.
            </li>
            <li>
              <strong>Take one step forward.</strong> Save a focus locally, or
              choose later.
            </li>
          </ol>
          <p>
            All trades are fictional. These checks are computed from the sample
            records; there is no live AI or broker connection.
          </p>
          <p>
            Changed rules are a comparison against sample history. Missing
            evidence is never treated as following a rule.
          </p>
        </Modal>
      )}
      {resetOpen && (
        <Modal title="Start fresh?" onClose={() => setResetOpen(false)}>
          <p>
            This clears your saved review and choices in this browser and
            restores the initial demo.
          </p>
          <div className="modal-actions">
            <button className="outline" onClick={() => setResetOpen(false)}>
              Keep my review
            </button>
            <button className="primary" onClick={reset}>
              Reset demo
            </button>
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </Modal>
      )}
    </>
  );
}

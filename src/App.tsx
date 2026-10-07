import { useEffect, useMemo, useState } from "react";
import { Header, Modal } from "./components/Chrome";
import { Welcome } from "./components/Welcome";
import { Rules, type Draft } from "./components/Rules";
import { SessionReview } from "./components/SessionReview";
import { Completion } from "./components/Completion";
import { createRules, sampleSession } from "./core/fixtures";
import { reviewSession, validRules } from "./core/review";
import { loadReview, saveReview, STORAGE_KEY } from "./core/storage";
import type { ConfirmedRules, Focus, SavedReview } from "./core/types";
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
  const [draft, setDraft] = useState<Draft>({
    maxPositions: "3",
    cutoff: "11:00",
  });
  const [rules, setRules] = useState<ConfirmedRules | null>(null);
  const [complete, setComplete] = useState(true);
  const [selectedId, setSelectedId] = useState("D");
  const [focus, setFocus] = useState<Focus | null>(null);
  const [saved, setSaved] = useState<SavedReview | null>(initialSaved);
  const [help, setHelp] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [error, setError] = useState("");
  const review = useMemo(
    () => (rules ? reviewSession(rules, sampleSession(complete)) : null),
    [rules, complete],
  );
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    document.querySelector<HTMLElement>("main h1")?.focus();
  }, [stage]);
  const changeStage = (next: typeof stage) => {
    setError("");
    setStage(next);
  };
  const confirm = () => {
    if (!validRules(Number(draft.maxPositions), draft.cutoff)) {
      setError("Choose a whole number from 1 to 50 and a valid entry time.");
      return;
    }
    setRules(createRules(Number(draft.maxPositions), draft.cutoff));
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
    setSaved(null);
    setSelectedId("D");
    setRules(null);
    setFocus(null);
    setComplete(true);
    setDraft({ maxPositions: "3", cutoff: "11:00" });
    setResetOpen(false);
    changeStage("welcome");
  };
  const save = () => {
    if (!review || !focus) return;
    try {
      setSaved(saveReview(localStorage, review, focus));
      changeStage("complete");
    } catch {
      setError(
        "Your browser could not save this review. Allow local storage, then try again.",
      );
    }
  };
  const openSaved = () => {
    if (!saved) return;
    setRules(saved.review.rules);
    setSelectedId(
      saved.review.findings.find((f) => f.status === "deviated")?.positionId ??
        saved.review.session.positions[0].id,
    );
    setDraft({
      maxPositions: String(saved.review.rules.maxPositions),
      cutoff: saved.review.rules.cutoff,
    });
    setComplete(saved.review.session.recordsComplete);
    setFocus(saved.focus);
    changeStage("complete");
  };
  return (
    <>
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
            setDraft({ maxPositions: "3", cutoff: "11:00" });
            setRules(null);
            setSelectedId("D");
            setComplete(true);
            setFocus(null);
            changeStage("rules");
          }}
          onCustom={() => changeStage("rules")}
          saved={saved}
          onSaved={openSaved}
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
          onSelect={setSelectedId}
          review={review}
          complete={complete}
          onComplete={setComplete}
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
          onExplore={() => changeStage("rules")}
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
              <strong>Confirm two rules.</strong> Choose a daily position limit
              and an entry cutoff.
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

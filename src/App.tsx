import { StepRail } from "./workspace/StepRail";
import { SampleSheet } from "./workspace/SampleSheet";
import { createPresetSession } from "./core/strategy-library";
import {
  AccountReviewSave,
  AccountReviewLibrary,
} from "./workspace/AccountReviews";
import { study } from "./study/client";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowLeft,
  ChartNoAxesColumnIncreasing,
  Check,
  Clock3,
  FileText,
  Home,
  Laptop,
  Menu,
  Plus,
  X,
} from "lucide-react";
import {
  defaultStrategy,
  confirmStrategy,
  type StrategyDraft,
} from "./core/workspace";
import type { ConfirmedRules, Position, Session } from "./core/types";

import {
  reviewSession,
  reviewCounts,
  REVIEW_LOGIC_VERSION,
  RULE_LABELS,
} from "./core/review";
import { StrategyEditor } from "./workspace/StrategyEditor";
import { TradeWorkspace } from "./workspace/TradeWorkspace";
import { ReviewView } from "./workspace/ReviewView";
import {
  readWorkspace,
  writeWorkspace,
  type ReviewEntry,
} from "./workspace/persistence";
import "./workspace/workspace.css";
import {
  InternalJourney,
  trackPage,
  workspaceJourney,
} from "./workspace/InternalJourney";
import { useToast } from "./workspace/Toasts";
const Orbit = lazy(() => import("./workspace/Orbit"));
type Page = "overview" | "strategy" | "trades" | "history";

const nav = [
  { id: "overview", label: "Overview", Icon: Home },
  { id: "strategy", label: "My strategy", Icon: FileText },
  { id: "trades", label: "Trade review", Icon: ChartNoAxesColumnIncreasing },
  { id: "history", label: "History", Icon: Clock3 },
] as const;
export default function App() {
  const [initial] = useState(readWorkspace);
  const notify = useToast();
  const strategyReturn = useRef<Page>("overview");
  const [page, setPage] = useState<Page>("overview");
  const [strategy, setStrategy] = useState<StrategyDraft>(
    initial?.strategy ?? structuredClone(defaultStrategy),
  );
  const [confirmed, setConfirmed] = useState<ConfirmedRules | null>(
    initial?.confirmed ?? null,
  );
  const [history, setHistory] = useState<ReviewEntry[]>(initial?.history ?? []);
  const [active, setActive] = useState<ReviewEntry | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [feedback, setFeedback] = useState(false);
  const [sampleSheet, setSampleSheet] = useState(false);
  const [focusStep, setFocusStep] = useState(false);
  const feedbackTrigger = useRef<HTMLButtonElement>(null);
  const [mobile, setMobile] = useState(
    () => matchMedia("(max-width: 600px)").matches,
  );
  useEffect(() => {
    const query = matchMedia("(max-width: 600px)");
    const update = () => {
      setMobile(query.matches);
      setMobileNav(false);
    };
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    document.querySelector<HTMLElement>("header h1")?.focus();
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [page, active?.id]);
  useEffect(() => {
    if (error)
      notify({
        title: "Something needs attention",
        description: error,
        tone: "error",
      });
  }, [error, notify]);
  function go(next: Page) {
    setFocusStep(false);
    if (next === "strategy" && page !== "strategy")
      strategyReturn.current = page;
    if (next === "strategy") workspaceJourney.start("rules");
    trackPage(next);
    setPage(next);
    setError("");
    setMessage("");
    setMobileNav(false);
    setActive(null);
  }
  function persist(
    nextStrategy = strategy,
    nextConfirmed = confirmed,
    nextHistory = history,
  ) {
    try {
      writeWorkspace({
        strategy: nextStrategy,
        confirmed: nextConfirmed,
        history: nextHistory,
      });
      return true;
    } catch {
      setError(
        "This browser could not save your changes. Keep this page open or export your review.",
      );
      return false;
    }
  }
  function changeStrategy(next: StrategyDraft) {
    setStrategy(next);
    setConfirmed(null);
    persist(next, null);
  }
  function confirm() {
    try {
      const rules = confirmStrategy(strategy);
      if (!persist(strategy, rules)) return;
      study.outcomes(strategy);
      study.complete("rules");
      setConfirmed(rules);
      workspaceJourney.action("rules_confirmed");
      go("trades");
      notify({
        title: "Rules confirmed",
        description: "Choose the trades you want to review.",
      });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function startReview(
    session: Session,
    source: "sample" | "manual" | "csv",
    rules = confirmed,
    strategyName = strategy.name,
  ) {
    setFocusStep(false);
    if (!rules) {
      go("strategy");
      setMessage(
        "Confirm your checklist first. These rules will be used for the review.",
      );
      return;
    }
    try {
      study.start("review");
      workspaceJourney.stage("session");
      setActive({
        id: crypto.randomUUID(),
        reviewLogicVersion: REVIEW_LOGIC_VERSION,
        recomputed: false,
        name:
          source === "sample"
            ? `${rules.setup?.label ?? "Fictional"} practice`
            : `Trade review · ${session.date}`,
        savedAt: new Date().toISOString(),
        source,
        strategyName,
        focus: "",
        review: reviewSession(rules, session, source),
      });
      setPage("trades");
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function useSample(draft: StrategyDraft) {
    try {
      const rules = confirmStrategy(draft);
      if (!persist(draft, rules)) return;
      setStrategy(draft);
      setConfirmed(rules);
      workspaceJourney.start("rules");
      study.outcomes(draft);
      study.complete("rules");
      workspaceJourney.action("rules_confirmed");
      setSampleSheet(false);
      startReview(
        createPresetSession(draft.setup!.kind),
        "sample",
        rules,
        draft.name,
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function nextFocus() {
    setFocusStep(true);
    requestAnimationFrame(() => {
      const node = document.getElementById("next-focus");
      node?.scrollIntoView({
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
        block: "start",
      });
      node?.focus({ preventScroll: true });
    });
  }
  function save(focus: string) {
    if (!active) return;
    const entry = {
      ...active,
      focus,
      savedAt: new Date().toISOString(),
      reviewLogicVersion: REVIEW_LOGIC_VERSION,
      recomputed: false,
    };
    const next = [entry, ...history.filter((h) => h.id !== entry.id)].slice(
      0,
      50,
    );
    if (persist(strategy, confirmed, next)) {
      study.start("action");
      study.complete("action");
      workspaceJourney.action("focus_saved");
      workspaceJourney.stage("complete");
      setHistory(next);
      setActive(entry);
      setFocusStep(true);
      setMessage("");
      notify({
        title: history.some((h) => h.id === entry.id)
          ? "Review updated"
          : "Review saved",
        description: "Your review and action plan are saved on this device.",
        action: { label: "View history", onClick: () => go("history") },
      });
    }
  }
  function correctPosition(position: Position) {
    setActive((current) =>
      current
        ? {
            ...current,
            reviewLogicVersion: REVIEW_LOGIC_VERSION,
            recomputed: false,
            review: reviewSession(
              current.review.rules,
              {
                ...current.review.session,
                positions: current.review.session.positions.map((p) =>
                  p.id === position.id ? position : p,
                ),
              },
              current.source,
            ),
          }
        : current,
    );
  }
  const title =
    page === "overview"
      ? "Your trading, a little clearer."
      : page === "strategy"
        ? "My strategy"
        : page === "history"
          ? "Your review history"
          : "Trade review";
  return (
    <div className="workspace">
      <a className="skip-link" href="#workspace-main">
        Skip to content
      </a>
      <aside
        inert={mobile && !mobileNav}
        className={`sidebar ${mobileNav ? "is-open" : ""}`}
      >
        <a
          href="#"
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            go("overview");
          }}
        >
          <span className="brand-mark">◩</span>
          <span>Trading Copilot</span>
        </a>
        <nav aria-label="Main navigation">
          {nav.map(({ id, label, Icon }) => (
            <button
              key={id}
              className={page === id ? "active" : ""}
              aria-current={page === id ? "page" : undefined}
              onClick={() => go(id)}
            >
              <Icon size={20} />
              {label}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <Laptop size={16} />
          <span>Stored on this device</span>
        </div>
      </aside>
      <div className="workspace-body">
        <header className="workspace-header">
          <button
            className="mobile-menu icon-button"
            aria-label={mobileNav ? "Close navigation" : "Open navigation"}
            onClick={() => setMobileNav(!mobileNav)}
          >
            {mobileNav ? <X /> : <Menu />}
          </button>
          <h1 tabIndex={-1}>{title}</h1>
          <button
            className="secondary"
            onClick={() => go(confirmed ? "trades" : "strategy")}
          >
            <Plus size={18} />
            <span>New review</span>
          </button>
        </header>
        {!study.session() && <InternalJourney />}
        <main id="workspace-main" className="workspace-main" key={page}>
          {error && (
            <div role="alert" className="notice error-notice">
              {error}
            </div>
          )}
          {message && (
            <div role="status" className="notice success-notice">
              <Check size={16} />
              {message}
            </div>
          )}
          <StepRail
            current={
              active
                ? focusStep
                  ? 3
                  : 2
                : page === "strategy" || !confirmed
                  ? 0
                  : 1
            }
            complete={!!active && history.some((h) => h === active)}
            primary={page === "overview" || page === "history"}
            onContinue={() =>
              active
                ? nextFocus()
                : go(page === "strategy" || !confirmed ? "strategy" : "trades")
            }
          />
          {page === "overview" && (
            <>
              <section className="dashboard-hero">
                <div>
                  <h2>A better next trade starts with a clear review.</h2>
                  <p>Your strategy. Your trades. One useful next step.</p>
                </div>
                <Suspense
                  fallback={<div className="orbit orbit-fallback">◎</div>}
                >
                  <Orbit />
                </Suspense>
              </section>
              <div className="overview-columns single-column">
                <section className="panel strategy-preview">
                  <h2>Your strategy</h2>
                  <p className="field-note">
                    {confirmed
                      ? "Confirmed strategy"
                      : "Example checklist · confirm or change it"}
                  </p>
                  <h3>{strategy.name}</h3>
                  <p className="muted">
                    {strategy.enabledRules
                      .map((id) =>
                        id === "planned-risk"
                          ? `Up to ₹${strategy.maxRisk} planned risk`
                          : id === "reward-risk"
                            ? `At least ${strategy.minRewardRisk}R planned reward`
                            : RULE_LABELS[id],
                      )
                      .join(" · ")}
                  </p>
                  <button className="secondary" onClick={() => go("strategy")}>
                    {confirmed ? "Edit strategy" : "Set up my strategy"}
                    <ArrowRight size={16} />
                  </button>
                </section>
              </div>
              <HistoryTable
                history={history.slice(0, 3)}
                onOpen={(e) => {
                  setActive(e);
                  setPage("trades");
                }}
                onSample={() => setSampleSheet(true)}
              />
            </>
          )}
          {page === "strategy" && (
            <>
              <button
                className="text-button strategy-back"
                onClick={() => go(strategyReturn.current)}
              >
                <ArrowLeft size={16} />
                Back to{" "}
                {strategyReturn.current === "trades"
                  ? "trades"
                  : strategyReturn.current === "history"
                    ? "history"
                    : "overview"}
              </button>
              <StrategyEditor
                draft={strategy}
                onChange={changeStrategy}
                onConfirm={confirm}
                confirmed={!!confirmed}
              />
            </>
          )}
          {page === "trades" &&
            (active ? (
              <>
                <ReviewView
                  key={active.id}
                  entry={active}
                  onSave={save}
                  onCorrect={correctPosition}
                  onBack={() => {
                    setActive(null);
                    setMessage("");
                  }}
                  saved={history.some((h) => h === active)}
                />
                {study.session()?.displayName && (
                  <AccountReviewSave
                    key={active.id}
                    entry={active}
                    saved={history.some((h) => h === active)}
                  />
                )}
              </>
            ) : (
              <TradeWorkspace
                rules={confirmed}
                onPreset={(next) => {
                  changeStrategy(next);
                  go("strategy");
                  setMessage(
                    "Review this setup and its risk controls, then confirm before choosing trades.",
                  );
                }}
                onReview={startReview}
              />
            ))}
          {page === "history" && (
            <>
              <HistoryTable
                history={history}
                onOpen={(e) => {
                  setActive(e);
                  setPage("trades");
                }}
                onSample={() => setSampleSheet(true)}
              />
              {study.session()?.displayName && (
                <AccountReviewLibrary
                  onOpen={(entry) => {
                    const next = [
                      entry,
                      ...history.filter((h) => h.id !== entry.id),
                    ].slice(0, 50);
                    if (!persist(strategy, confirmed, next)) return;
                    setHistory(next);
                    setActive(entry);
                    setPage("trades");
                    notify({
                      title: "Account review opened",
                      description:
                        "This review keeps its original confirmed rules and next focus.",
                    });
                  }}
                />
              )}
            </>
          )}
          {!study.session() && import.meta.env.DEV && (
            <p className="field-note">
              <a href="?researcher=1">Researcher rehearsal desk</a> ·{" "}
              <a href="?study=1">Join a rehearsal session</a>
            </p>
          )}
          <footer className="workspace-footer">
            <span>
              For reflection on documented trading rules. No trading
              recommendations.
            </span>
            {!study.session() && (
              <button
                ref={feedbackTrigger}
                className="text-button"
                onClick={() => setFeedback(true)}
              >
                Share feedback
              </button>
            )}
          </footer>
        </main>
      </div>
      {sampleSheet && (
        <SampleSheet onClose={() => setSampleSheet(false)} onUse={useSample} />
      )}
      {feedback && (
        <Feedback
          onClose={() => {
            setFeedback(false);
            feedbackTrigger.current?.focus();
          }}
        />
      )}
    </div>
  );
}
function HistoryTable({
  history,
  onOpen,
  onSample,
}: {
  history: ReviewEntry[];
  onOpen: (e: ReviewEntry) => void;
  onSample: () => void;
}) {
  return (
    <section className="panel history-panel">
      <h2>Recent reviews</h2>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Session</th>
              <th>Trades</th>
              <th>Broken rules</th>
              <th>Needs review</th>
              <th>Not enough data</th>
              <th>Date</th>
              <th>
                <span className="sr-only">Action</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {history.length ? (
              history.map((e) => (
                <tr key={e.id}>
                  <td>
                    <strong>{e.name}</strong>
                    <small>{e.strategyName}</small>
                  </td>
                  <td>{e.review.session.positions.length}</td>
                  <td>{reviewCounts(e.review).brokenRules}</td>
                  <td>{reviewCounts(e.review).reportedWarnings}</td>
                  <td>{reviewCounts(e.review).notEnoughData}</td>
                  <td>
                    {new Date(e.savedAt).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                    })}
                  </td>
                  <td>
                    <button className="text-button" onClick={() => onOpen(e)}>
                      Open review
                      <ArrowRight size={15} />
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td>
                  <strong>Fictional sample</strong>
                  <small>Explore before adding your trades</small>
                </td>
                <td>4</td>
                <td>—</td>
                <td>—</td>
                <td>—</td>
                <td>Sample data</td>
                <td>
                  <button className="text-button" onClick={onSample}>
                    Try sample
                    <ArrowRight size={15} />
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="field-note">
        Practice with sample trades, or add your own. Your trade records stay in
        this browser.
      </p>
    </section>
  );
}
function Feedback({ onClose }: { onClose: () => void }) {
  const [comment, setComment] = useState("");
  const [rating, setRating] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="workspace-overlay" onClick={onClose}>
      <section
        className="feedback-dialog panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          if (e.key === "Tab") {
            const controls = Array.from(
              e.currentTarget.querySelectorAll<HTMLElement>(
                "button,input,textarea,select",
              ),
            ).filter((el) => !el.hasAttribute("disabled"));
            const first = controls[0],
              last = controls.at(-1);
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last?.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <div className="section-title">
          <h2 id="feedback-title">What would make this more useful?</h2>
          <button
            autoFocus
            className="icon-button"
            aria-label="Close feedback"
            onClick={onClose}
          >
            <X />
          </button>
        </div>
        {done ? (
          <p role="status">
            Saved on this device. This feedback has not been sent anywhere.
          </p>
        ) : (
          <>
            <p className="muted">
              Local product feedback. Formal study consent and questionnaire are
              separate.
            </p>
            <label>
              How useful was this review?
              <select
                value={rating}
                onChange={(e) => setRating(e.target.value)}
              >
                <option value="">Choose a rating</option>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n} ·{" "}
                    {n === 1
                      ? "Not useful"
                      : n === 5
                        ? "Very useful"
                        : "Somewhat useful"}
                  </option>
                ))}
              </select>
            </label>
            <label>
              What worked, felt confusing, or was missing?
              <textarea
                maxLength={2000}
                rows={4}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </label>
            <p className="field-note">
              Keep names, contact and account details out.
            </p>
            {error && <p role="alert">{error}</p>}
            <button
              className="primary"
              disabled={!rating || !comment.trim()}
              onClick={() => {
                try {
                  const key = "trading-copilot.local-feedback";
                  const existing = JSON.parse(
                    localStorage.getItem(key) ?? "[]",
                  );
                  localStorage.setItem(
                    key,
                    JSON.stringify([
                      ...(Array.isArray(existing) ? existing : []),
                      {
                        rating: Number(rating),
                        comment,
                        at: new Date().toISOString(),
                      },
                    ]),
                  );
                  setDone(true);
                } catch {
                  setError("This browser could not save your feedback.");
                }
              }}
            >
              Save feedback locally
            </button>
          </>
        )}
      </section>
    </div>
  );
}

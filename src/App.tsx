import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
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
import type { ConfirmedRules, Session } from "./core/types";
import { realisticSession } from "./core/fixtures";
import { reviewSession, RULE_LABELS } from "./core/review";
import { StrategyEditor } from "./workspace/StrategyEditor";
import { TradeEntry } from "./workspace/TradeEntry";
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
const Orbit = lazy(() => import("./workspace/Orbit"));
type Page = "overview" | "strategy" | "trades" | "history";
const initial = readWorkspace();
const nav = [
  { id: "overview", label: "Overview", Icon: Home },
  { id: "strategy", label: "My strategy", Icon: FileText },
  { id: "trades", label: "Trade review", Icon: ChartNoAxesColumnIncreasing },
  { id: "history", label: "History", Icon: Clock3 },
] as const;
export default function App() {
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
  function go(next: Page) {
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
      setConfirmed(rules);
      workspaceJourney.action("rules_confirmed");
      go("trades");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function startReview(session: Session, source: "sample" | "manual") {
    if (!confirmed) {
      go("strategy");
      setMessage(
        "Confirm your checklist first. These rules will be used for the review.",
      );
      return;
    }
    try {
      workspaceJourney.stage("session");
      setActive({
        id: crypto.randomUUID(),
        name:
          source === "sample"
            ? "Fictional sample"
            : `Trade review · ${session.date}`,
        savedAt: new Date().toISOString(),
        source,
        strategyName: strategy.name,
        focus: "",
        review: reviewSession(confirmed, session),
      });
      setPage("trades");
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function save(focus: string) {
    if (!active) return;
    const entry = { ...active, focus, savedAt: new Date().toISOString() };
    const next = [entry, ...history.filter((h) => h.id !== entry.id)].slice(
      0,
      50,
    );
    if (persist(strategy, confirmed, next)) {
      workspaceJourney.action("focus_saved");
      workspaceJourney.stage("complete");
      setHistory(next);
      setActive(entry);
      setMessage("Review saved on this device.");
    }
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
            className="primary"
            onClick={() => go(confirmed ? "trades" : "strategy")}
          >
            <Plus size={18} />
            <span>New review</span>
          </button>
        </header>
        <InternalJourney />
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
              <div className="overview-columns">
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
                <section className="panel how-panel">
                  <h2>How a review works</h2>
                  <ol>
                    {[
                      [
                        "Confirm your rules",
                        "Use your strategy as a checklist.",
                      ],
                      [
                        "Add a few trades",
                        "Enter your records or explore a fictional sample.",
                      ],
                      [
                        "Find your next focus",
                        "See the evidence and choose one useful step.",
                      ],
                    ].map(([h, p], i) => (
                      <li key={h}>
                        <span>{i + 1}</span>
                        <div>
                          <strong>{h}</strong>
                          <p>{p}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </section>
              </div>
              <HistoryTable
                history={history.slice(0, 3)}
                onOpen={(e) => {
                  setActive(e);
                  setPage("trades");
                }}
                onSample={() => startReview(realisticSession(), "sample")}
              />
            </>
          )}
          {page === "strategy" && (
            <StrategyEditor
              draft={strategy}
              onChange={changeStrategy}
              onConfirm={confirm}
              confirmed={!!confirmed}
            />
          )}
          {page === "trades" &&
            (active ? (
              <ReviewView
                key={active.id}
                entry={active}
                onSave={save}
                onBack={() => {
                  setActive(null);
                  setMessage("");
                }}
                saved={history.some((h) => h.id === active.id)}
              />
            ) : confirmed ? (
              <TradeEntry
                onSession={(s) => startReview(s, "manual")}
                onSample={() => startReview(realisticSession(), "sample")}
              />
            ) : (
              <section className="panel empty-state">
                <FileText size={32} />
                <h2>Start with your rules.</h2>
                <p className="muted">
                  A review needs your confirmed checklist. Describe your
                  strategy or set the supported checks manually.
                </p>
                <button className="primary" onClick={() => go("strategy")}>
                  Set up my strategy
                  <ArrowRight size={16} />
                </button>
              </section>
            ))}
          {page === "history" && (
            <HistoryTable
              history={history}
              onOpen={(e) => {
                setActive(e);
                setPage("trades");
              }}
              onSample={() => startReview(realisticSession(), "sample")}
            />
          )}
          <footer className="workspace-footer">
            <span>
              For reflection on documented trading rules. No trading
              recommendations.
            </span>
            <button
              ref={feedbackTrigger}
              className="text-button"
              onClick={() => setFeedback(true)}
            >
              Share feedback
            </button>
          </footer>
        </main>
      </div>
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
              <th>Checks to revisit</th>
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
                  <td>
                    {
                      e.review.findings.filter((f) => f.status === "deviated")
                        .length
                    }
                  </td>
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

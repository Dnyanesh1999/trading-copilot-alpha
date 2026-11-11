import { CompletedReviewBackups } from "../workspace/AccountReviews";
import { readWorkspace } from "../workspace/persistence";
import {
  useEffect,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from "react";
import {
  ArrowRight,
  Check,
  ShieldCheck,
  LogOut,
  Download,
  Users,
  RefreshCw,
} from "lucide-react";
import App from "../App";
import { study, startStudyRecording, defaultAssessments } from "./client";
import {
  CONSENT_VERSION,
  TASKS,
  SUS_ITEMS,
  PROJECT_ITEMS,
  ratingIds,
  type FinishData,
  csv,
  validateFinish,
} from "./protocol";
import { useToast } from "../workspace/Toasts";
import "./study.css";
import { AccountEntry, signOutAccount, type EntryConfig } from "./AccountEntry";
function download(name: string, text: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function StudyShell() {
  const state = useSyncExternalStore(study.subscribe, study.snapshot);
  const [screen, setScreen] = useState<
    "join" | "app" | "questionnaire" | "done" | "stopped" | "checking"
  >(
    state.session && !new URLSearchParams(location.search).has("reset")
      ? "checking"
      : "join",
  );
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const notify = useToast();
  useEffect(() => {
    if (!state.session || new URLSearchParams(location.search).has("reset"))
      return;
    let live = true;
    study
      .request("/session")
      .then((r) => {
        if (live) {
          if (r.status === "active") {
            study.resume();
            setScreen("app");
          } else setScreen(r.status === "finished" ? "done" : "stopped");
        }
      })
      .catch((e) => {
        if (live) {
          setError(e.message);
          setScreen("checking");
        }
      });
    return () => {
      live = false;
    };
  }, [state.session?.sessionId]);
  useEffect(
    () => (screen === "app" ? startStudyRecording() : undefined),
    [screen],
  );
  async function logout() {
    setBusy(true);
    setError("");
    try {
      await study.stop();
      await signOutAccount();
      setScreen("join");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function stop() {
    setBusy(true);
    setError("");
    try {
      await study.stop();
      setScreen("stopped");
      notify({
        title: "Session stopped",
        description: "No questionnaire was submitted.",
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (screen === "join") return <Join onJoin={() => setScreen("app")} />;
  if (screen === "checking")
    return (
      <StudyPage title="Restore your session">
        <p>Checking the saved session with the recording service.</p>
        {error && (
          <p role="alert" className="notice error-notice">
            {error}
          </p>
        )}
        <button className="secondary" onClick={() => location.reload()}>
          Retry connection
        </button>
        <button
          className="text-button"
          onClick={() => {
            study.clear();
            setScreen("join");
            setError("");
          }}
        >
          Return to sign in
        </button>
      </StudyPage>
    );
  if (screen === "done" || screen === "stopped")
    return (
      <StudyPage
        title={
          screen === "done"
            ? "Your session is complete."
            : "Your session has stopped."
        }
      >
        <div className="study-success">
          <Check size={28} />
        </div>
        <p>
          {state.session?.displayName ?? state.session?.participantId} ·{" "}
          {screen === "done"
            ? "The recording service confirmed your questionnaire and task responses were saved."
            : "Your earlier consented activity remains recorded; no questionnaire was submitted."}
        </p>
        <p className="muted">
          These are rehearsal records, separate from a real trader study. To
          request removal of a real study record, contact the researcher using
          the agreed study procedure.
        </p>
        {state.session?.displayName && (
          <CompletedReviewBackups entries={readWorkspace()?.history ?? []} />
        )}
        <button
          className="primary"
          onClick={() => {
            study.clear();
            setScreen("join");
          }}
        >
          Leave this session
          <LogOut size={16} />
        </button>
      </StudyPage>
    );
  return (
    <>
      <div className="study-session-bar">
        <span>
          <ShieldCheck size={16} />
          <strong>
            {state.session?.displayName ?? state.session?.participantId}
          </strong>
          <span>
            {state.session?.mode === "participant"
              ? "Review session"
              : "Internal rehearsal"}
          </span>
        </span>
        <div>
          <span role="status">
            {state.issue
              ? "Connection needs attention"
              : state.pending
                ? `${state.pending} activity records pending`
                : "Activity saved"}
          </span>
          <button
            className="text-button"
            disabled={busy}
            onClick={() => void stop()}
          >
            Stop session
          </button>
          {state.session?.displayName && (
            <button
              className="icon-button"
              aria-label="Sign out"
              disabled={busy}
              onClick={() => void logout()}
            >
              <LogOut size={16} />
            </button>
          )}
          <button
            className="secondary"
            onClick={() => {
              study.suspend();
              void study.flush();
              setScreen(screen === "app" ? "questionnaire" : "app");
            }}
          >
            {screen === "app" ? "Finish & give feedback" : "Back to review"}
          </button>
        </div>
      </div>
      {error && (
        <p role="alert" className="notice error-notice">
          {error}
        </p>
      )}
      {state.issue && (
        <div className="study-recording-notice" role="alert">
          {state.issue}
          <button className="text-button" onClick={() => void study.flush()}>
            Retry recording
          </button>
        </div>
      )}
      {screen === "app" ? (
        <App studyMode />
      ) : (
        <Questionnaire
          onSave={async (data) => {
            await study.finish(data);
            setScreen("done");
            notify({
              title: "Session saved",
              description: "Task responses and questionnaire are stored.",
            });
          }}
        />
      )}
    </>
  );
}
function StudyPage({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main className="study-page">
      <a href="./" className="study-brand">
        ◩ Trading Copilot
      </a>
      <section className="panel study-card">
        <span className="study-eyebrow">A clearer trade review</span>
        <h1>{title}</h1>
        {children}
      </section>
    </main>
  );
}
function Join({ onJoin }: { onJoin: () => void }) {
  const [config, setConfig] = useState<EntryConfig | null>(null);
  useEffect(() => {
    study
      .request("/config")
      .then(setConfig)
      .catch((e) => setError(e.message));
  }, []);
  const [code, setCode] = useState(""),
    [style, setStyle] = useState(""),
    [experience, setExperience] = useState(""),
    [device, setDevice] = useState(""),
    [consent, setConsent] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const session = await study.request("/sessions", {
        accessCode: code.trim(),
        tradingStyle: style,
        experience,
        device,
        consent,
        consentVersion: config?.consentVersion,
      });
      study.begin(session);
      onJoin();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!config)
    return (
      <StudyPage title="Welcome to Trading Copilot">
        <p role="status">Connecting…</p>
        {error && <p role="alert">{error}</p>}
      </StudyPage>
    );
  if (config?.accountLogin)
    return <AccountEntry config={config} onJoin={onJoin} />;
  return (
    <StudyPage title="Join a review session.">
      <p className="muted">
        Enter the private access code the researcher gave you. No email,
        password or account details needed.
      </p>
      <div className="study-mode-note">
        <strong>
          {config?.mode === "participant"
            ? "Coded trader study"
            : "Internal rehearsal only"}
        </strong>
        <p>
          {config?.mode === "participant"
            ? "Your private code links this review with your task responses and feedback."
            : "Real trader sessions are not enabled while ethics confirmation is pending. Use fictional strategy text and sample trades here."}
        </p>
      </div>
      <form onSubmit={(e) => void submit(e)}>
        <label>
          Access code
          <input
            autoComplete="off"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            maxLength={100}
            required
          />
        </label>
        <div className="study-profile-grid">
          <label>
            Trading style
            <select
              aria-label="Trading style"
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              required
            >
              <option value="">Choose a style</option>
              <option value="swing">Swing</option>
              <option value="intraday">Intraday</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label>
            Trading experience
            <select
              aria-label="Trading experience"
              value={experience}
              onChange={(e) => setExperience(e.target.value)}
              required
            >
              <option value="">Choose experience</option>
              {["under 1 year", "1-3 years", "over 3 years"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            Device used today
            <select
              aria-label="Device used today"
              value={device}
              onChange={(e) => setDevice(e.target.value)}
              required
            >
              <option value="">Choose this device</option>
              <option value="desktop">Desktop / laptop</option>
              <option value="mobile">Mobile</option>
            </select>
          </label>
        </div>
        <details className="study-information" open>
          <summary>
            {config?.mode === "participant"
              ? "Participant information"
              : "What happens in this rehearsal?"}
          </summary>
          {config?.mode === "participant" ? (
            config.information?.split(/\n\n/).map((p, i) => <p key={i}>{p}</p>)
          ) : (
            <>
              <p>
                Try the strategy → rules → trade review → next action flow, then
                answer a short questionnaire. Allow around 20–30 minutes.
              </p>
              <p>
                Taking part is voluntary. You can stop at any point. No name,
                email, phone number or account number is requested. Your access
                code links this session to a study label, not a verified
                identity.
              </p>
              <p>
                After you agree, the service stores your coded profile, consent
                version, task activity and visible time, AI proposal outcome
                counts, questionnaire responses and optional feedback. The
                researcher can export these records. Do not include identifying
                details in text.
              </p>
              <p>
                Trade CSVs and saved reviews stay in this browser. If you choose
                AI clarification, your strategy text and clarification answers
                are sent to Google through the server. Trade files are not sent
                to that AI request.
              </p>
              <p>
                This is not the final participant information sheet. Retention,
                withdrawal, contacts and provider/storage details must be agreed
                before real participant sessions. Until then, only internal
                fictional rehearsals are accepted.
              </p>
            </>
          )}
        </details>
        <label className="study-check">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            required
          />
          <span>
            {config?.mode === "participant"
              ? "I have read the participant information and agree to take part in the described study."
              : "I understand this is a fictional internal rehearsal and agree to the described recording."}
          </span>
        </label>
        {error && (
          <p role="alert" className="notice error-notice">
            {error}
          </p>
        )}
        <button
          className="primary"
          disabled={
            busy ||
            !config ||
            !consent ||
            !code.trim() ||
            !style ||
            !experience ||
            !device
          }
        >
          {busy ? "Starting…" : "Start review session"}
          <ArrowRight size={16} />
        </button>
      </form>
    </StudyPage>
  );
}
function Questionnaire({
  onSave,
}: {
  onSave: (data: FinishData) => Promise<void>;
}) {
  const draftKey =
    "trading-copilot.study-questionnaire." + study.session()?.sessionId;
  const [draft] = useState<FinishData | null>(() => {
    try {
      const d = JSON.parse(sessionStorage.getItem(draftKey) ?? "null");
      return d && validateFinish({ ...d, noIdentifiers: true }) ? d : null;
    } catch {
      return null;
    }
  });
  const [ratings, setRatings] = useState<Record<string, number | null>>(
    () =>
      draft?.ratings ?? Object.fromEntries(ratingIds.map((id) => [id, null])),
  );
  const [assessments, setAssessments] = useState(
      () => draft?.assessments ?? defaultAssessments(),
    ),
    [comment, setComment] = useState(draft?.comment ?? ""),
    [theme, setTheme] = useState<FinishData["theme"]>(
      draft?.theme ?? "usefulness",
    ),
    [noIdentifiers, setNoIdentifiers] = useState(draft?.noIdentifiers ?? false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    try {
      sessionStorage.setItem(
        draftKey,
        JSON.stringify({ ratings, assessments, comment, theme, noIdentifiers }),
      );
    } catch {}
  }, [draftKey, ratings, assessments, comment, theme, noIdentifiers]);
  const items = [...SUS_ITEMS, ...PROJECT_ITEMS];
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSave({ ratings, assessments, comment, theme, noIdentifiers });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <StudyPage title="How was your review?">
      <p className="muted">
        Honest criticism helps. You can skip any rating. These answers do not
        affect your trade review.
      </p>
      <form onSubmit={(e) => void submit(e)}>
        <h2>Your tasks</h2>
        <p className="field-note">
          Suggested completion comes from app actions. Correct it if the task
          felt only partly done. Help is your own report.
        </p>
        <div className="study-task-assessments">
          {TASKS.map((t, i) => (
            <fieldset key={t.id}>
              <legend>
                {i + 1}. {t.label}
              </legend>
              <div className="study-profile-grid">
                <label>
                  How much did you complete?
                  <select
                    value={assessments[i].completed}
                    onChange={(e) =>
                      setAssessments((a) =>
                        a.map((v, j) =>
                          j === i
                            ? {
                                ...v,
                                completed: e.target.value as
                                  "yes" | "partly" | "no",
                              }
                            : v,
                        ),
                      )
                    }
                  >
                    <option value="yes">Completed</option>
                    <option value="partly">Partly</option>
                    <option value="no">Not completed</option>
                  </select>
                </label>
                <label>
                  Did you need help?
                  <select
                    value={assessments[i].neededHelp ?? ""}
                    onChange={(e) =>
                      setAssessments((a) =>
                        a.map((v, j) =>
                          j === i
                            ? {
                                ...v,
                                neededHelp: (e.target.value || null) as
                                  "yes" | "no" | null,
                              }
                            : v,
                        ),
                      )
                    }
                  >
                    <option value="">Prefer not to say / unknown</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </label>
              </div>
            </fieldset>
          ))}
        </div>
        <h2>System Usability Scale</h2>
        <p className="field-note">
          1 strongly disagree · 2 disagree · 3 neither · 4 agree · 5 strongly
          agree. “System” means Trading Copilot. Original SUS items, Brooke
          (1996).
        </p>
        {items.map((text, i) => (
          <div key={ratingIds[i]}>
            {i === 10 && (
              <>
                <h2>Your experience</h2>
                <p className="field-note">
                  These three project questions are analysed separately from
                  SUS.
                </p>
              </>
            )}
            <fieldset className="study-rating">
              <legend>
                {i < 10 ? i + 1 : i - 9}. {text}
              </legend>
              <div className="study-rating-options">
                {[1, 2, 3, 4, 5].map((n) => (
                  <label key={n}>
                    <input
                      type="radio"
                      name={ratingIds[i]}
                      value={n}
                      checked={ratings[ratingIds[i]] === n}
                      onChange={() =>
                        setRatings((r) => ({ ...r, [ratingIds[i]]: n }))
                      }
                    />
                    <span>{n}</span>
                  </label>
                ))}
                <label className="study-skip">
                  <input
                    type="radio"
                    name={ratingIds[i]}
                    checked={ratings[ratingIds[i]] === null}
                    onChange={() =>
                      setRatings((r) => ({ ...r, [ratingIds[i]]: null }))
                    }
                  />
                  <span>Skip</span>
                </label>
              </div>
            </fieldset>
          </div>
        ))}
        <h2>
          Anything else? <small>Optional</small>
        </h2>
        <label>
          Feedback topic
          <select
            value={theme}
            onChange={(e) => setTheme(e.target.value as FinishData["theme"])}
          >
            {["usefulness", "clarity", "trust", "missing feature", "bug"].map(
              (v) => (
                <option key={v}>{v}</option>
              ),
            )}
          </select>
        </label>
        <label>
          What worked, confused you, or felt missing?
          <textarea
            rows={4}
            maxLength={1500}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
        </label>
        <p className="field-note">
          Leave names, phone/account numbers and contact details out. Feedback
          is reviewed for redaction before sharing.
        </p>
        <label className="study-check">
          <input
            type="checkbox"
            checked={noIdentifiers}
            onChange={(e) => setNoIdentifiers(e.target.checked)}
            required
          />
          <span>I have kept identifying details out of my feedback.</span>
        </label>
        {error && (
          <p className="notice error-notice" role="alert">
            {error}
          </p>
        )}
        <button className="primary" disabled={busy || !noIdentifiers}>
          {busy ? "Saving your session…" : "Submit feedback & finish"}
          <Check size={16} />
        </button>
      </form>
    </StudyPage>
  );
}
type Rows = Record<string, unknown>[];
export function ResearcherDesk() {
  const cloudDesk =
    new URLSearchParams(location.search).get("cloud") === "1" &&
    ["127.0.0.1", "localhost"].includes(location.hostname);
  const adminPath = cloudDesk ? "/study-cloud-admin" : "/study-admin";
  const [mode, setMode] = useState("rehearsal");
  const [accountNames, setAccountNames] = useState<Record<string, string>>({});
  const [selectedSession, setSelectedSession] = useState("");
  useEffect(() => {
    fetch(cloudDesk ? "/study-cloud-config" : "/study-api/config")
      .then((r) => r.json())
      .then((c) => {
        setMode(c.mode);
        if (c.mode === "participant") setLabel("T01");
      })
      .catch(() => {});
  }, []);
  const [adminKey, setAdminKey] = useState("");
  const [data, setData] = useState<Record<string, Rows> | null>(null),
    [label, setLabel] = useState("DEMO01"),
    [invite, setInvite] = useState<{
      participantId: string;
      accessCode: string;
    } | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    setError("");
    try {
      const r = await fetch(adminPath + "/export", {
        headers: adminKey ? { Authorization: `Bearer ${adminKey}` } : {},
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Researcher access unavailable.");
      setData(d);
      const namesResponse = await fetch(adminPath + "/accounts", {
        headers: adminKey ? { Authorization: `Bearer ${adminKey}` } : {},
      });
      if (namesResponse.ok) {
        const names = await namesResponse.json();
        setAccountNames(
          Object.fromEntries(
            names.accounts.map((a: { participantId: string; name: string }) => [
              a.participantId,
              a.name,
            ]),
          ),
        );
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function create() {
    setBusy(true);
    setInvite(null);
    setError("");
    try {
      const r = await fetch(adminPath + "/invites", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(adminKey ? { Authorization: `Bearer ${adminKey}` } : {}),
        },
        body: JSON.stringify({ participantId: label }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setInvite(d);
      void load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <StudyPage title="Researcher rehearsal desk">
      <p className="muted">
        Coded sessions, task outcomes and feedback in one place. Local access is
        protected. {cloudDesk ? "Connected to the cloud database." : ""} These
        records are fictional rehearsals, never participant-study results.
      </p>
      {!data && (
        <section className="study-invitation">
          <label>
            Researcher access key
            <input
              type="password"
              autoComplete="off"
              value={adminKey}
              onChange={(e) => setAdminKey(e.target.value)}
            />
          </label>
          <button className="secondary" onClick={() => void load()}>
            Unlock researcher desk
          </button>
          <p className="field-note">
            This key is separate from trader invitations. Never share it with
            participants.
          </p>
        </section>
      )}
      <div className="study-mode-note">
        <strong>
          {mode === "participant"
            ? "Participant collection configured"
            : "External collection is off"}
        </strong>
        <p>
          Prepare and verify the flow here. Ethics clearance and approved
          participant information are required before real trader codes can be
          enabled.
        </p>
      </div>
      <p className="field-note">
        Account sign-in links each trader to a private coded record
        automatically. Share the app link; account users do not need access
        codes.
      </p>
      <details className="study-invitation">
        <summary>Legacy rehearsal access codes (optional)</summary>
        <h2>Create a private access code</h2>
        <label>
          Rehearsal label
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            pattern={mode === "participant" ? "T[0-9]{2}" : "DEMO[0-9]{2}"}
            maxLength={6}
          />
        </label>
        <button
          className="primary"
          disabled={busy}
          onClick={() => void create()}
        >
          Create access code
          <Users size={16} />
        </button>
        {invite && (
          <div className="notice">
            <strong>{invite.participantId}</strong>
            <button className="text-button" onClick={() => setInvite(null)}>
              Hide access code
            </button>
            <p>Keep this access code private. It is shown only once:</p>
            <code className="study-access-code">{invite.accessCode}</code>
            <p>
              <a href="?study=1" target="_blank" rel="noreferrer">
                Open session entry
              </a>
            </p>
            <button
              className="secondary"
              onClick={() =>
                download(
                  "private-rehearsal-invite.csv",
                  csv([invite], ["participantId", "accessCode"]),
                )
              }
            >
              <Download size={16} />
              Save invitation privately
            </button>
          </div>
        )}
      </details>
      {error && (
        <p role="alert" className="notice error-notice">
          {error}
        </p>
      )}
      <div className="section-title">
        <h2>Recorded sessions</h2>
        <button className="text-button" onClick={() => void load()}>
          <RefreshCw size={15} />
          Refresh
        </button>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Trader</th>
              <th>Session</th>
              <th>Started</th>
              <th>Status</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {data?.sessions.map((s) => (
              <tr key={String(s.session_id)}>
                <td>
                  {accountNames[String(s.participant_id)] ||
                    String(s.participant_id)}
                  {accountNames[String(s.participant_id)] && (
                    <small className="muted" style={{ display: "block" }}>
                      {String(s.participant_id)}
                    </small>
                  )}
                </td>
                <td>{String(s.session_id).slice(0, 8)}</td>
                <td>{String(s.started_at)}</td>
                <td>{String(s.status)}</td>
                <td>
                  <button
                    className="text-button"
                    aria-expanded={selectedSession === s.session_id}
                    onClick={() =>
                      setSelectedSession(
                        selectedSession === s.session_id
                          ? ""
                          : String(s.session_id),
                      )
                    }
                  >
                    View session
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!data?.sessions.length && (
        <p className="muted">
          No sessions recorded yet. Invitation creation does not count as
          participation.
        </p>
      )}
      {selectedSession && data && (
        <section
          className="panel study-session-details"
          aria-label="Selected session details"
        >
          <h2>Session {selectedSession.slice(0, 8)}</h2>
          <p className="field-note">
            Task completion and help are self-reported. Duration is app-visible
            time, not independently observed attention. These records are
            separate from private account review copies.
          </p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Completed</th>
                  <th>Visible seconds</th>
                  <th>Needed help</th>
                  <th>Evidence opened</th>
                </tr>
              </thead>
              <tbody>
                {data.tasks
                  .filter((t) => t.session_id === selectedSession)
                  .map((t) => (
                    <tr key={String(t.task_id)}>
                      <td>
                        {TASKS.find((task) => task.id === t.task_id)?.label ??
                          String(t.task_id)}
                      </td>
                      <td>{String(t.completed ?? "Not submitted")}</td>
                      <td>{String(t.time_seconds ?? "—")}</td>
                      <td>{String(t.needed_help ?? "Not submitted")}</td>
                      <td>{String(t.evidence_opened ?? "—")}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {!data.tasks.some((t) => t.session_id === selectedSession) && (
            <p>No final task responses submitted for this session.</p>
          )}
          <p>
            {
              data.ratings.filter(
                (r) => r.session_id === selectedSession && r.score !== null,
              ).length
            }{" "}
            scored questionnaire items ·{" "}
            {
              data.ratings.filter(
                (r) => r.session_id === selectedSession && r.score === null,
              ).length
            }{" "}
            skipped ·{" "}
            {
              data.comments.filter((c) => c.session_id === selectedSession)
                .length
            }{" "}
            comments ·{" "}
            {data.events.filter((e) => e.session_id === selectedSession).length}{" "}
            activity records
          </p>
          <button
            className="text-button"
            onClick={() => setSelectedSession("")}
          >
            Close details
          </button>
        </section>
      )}
      <h2>Export for analysis</h2>
      <p className="field-note">
        Completion/help are self-reported; timings and evidence opens come from
        app records. Review comments for identifiers before sharing. Each export
        retains session IDs and measurement provenance.
      </p>
      <div className="study-export-buttons">
        {[
          "participants",
          "tasks",
          "ratings",
          "comments",
          "sessions",
          "events",
        ].map((key) => (
          <button
            key={key}
            className="secondary"
            disabled={!data?.[key]?.length}
            onClick={() => {
              const rows = data![key];
              download(`rehearsal-${key}.csv`, csv(rows, Object.keys(rows[0])));
            }}
          >
            <Download size={15} />
            {key} ({data?.[key]?.length ?? 0})
          </button>
        ))}
      </div>
      <p className="field-note">
        <a href="./">Back to workspace</a>
      </p>
    </StudyPage>
  );
}

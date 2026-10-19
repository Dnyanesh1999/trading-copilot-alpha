import { downloadJson } from "./persistence";
import { useEffect, useState } from "react";
import { Cloud, RefreshCw, ArrowRight, Trash2 } from "lucide-react";
import { accountRequest } from "../study/AccountEntry";
import { validateReviewEntry, type ReviewEntry } from "../core/saved-review";
import { useToast } from "./Toasts";

export function AccountReviewSave({
  entry,
  saved,
}: {
  entry: ReviewEntry;
  saved: boolean;
}) {
  const [agree, setAgree] = useState(false),
    [busy, setBusy] = useState(false),
    [storedAt, setStoredAt] = useState("");
  const notify = useToast();
  async function save() {
    setBusy(true);
    try {
      await accountRequest("/account-api/reviews", {
        entry,
        disclosureVersion: "account-review-v1",
      });
      setStoredAt(entry.savedAt);
      notify({
        title: "Saved to your account",
        description:
          "Open History on another device after signing in to find this review.",
      });
    } catch (e) {
      notify({
        title: "Account copy was not saved",
        description: (e as Error).message,
        tone: "error",
      });
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="panel account-review-save"
      aria-label="Account review backup"
    >
      <div>
        <h2>
          <Cloud size={20} />
          Keep this review across devices.
        </h2>
        <p className="muted">
          Optional: save this review’s trade records, confirmed rules and next
          focus in your private account. Contents are encrypted in storage and
          excluded from study exports. A new save replaces this review’s
          previous account copy.
        </p>
      </div>
      <label className="study-check">
        <input
          type="checkbox"
          checked={agree}
          onChange={(e) => setAgree(e.target.checked)}
        />
        <span>I want this review stored in my account.</span>
      </label>
      {!saved && (
        <p className="field-note">Save your next focus above first.</p>
      )}
      <button
        className="secondary"
        disabled={!saved || !agree || busy || storedAt === entry.savedAt}
        onClick={() => void save()}
      >
        <Cloud size={16} />
        {busy
          ? "Saving…"
          : storedAt === entry.savedAt
            ? "Account copy saved"
            : "Save to account"}
      </button>
    </section>
  );
}
export function AccountReviewLibrary({
  onOpen,
}: {
  onOpen: (entry: ReviewEntry) => void;
}) {
  const [entries, setEntries] = useState<ReviewEntry[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [removeId, setRemoveId] = useState("");
  const notify = useToast();
  async function load() {
    setBusy(true);
    setError("");
    try {
      const data = await accountRequest("/account-api/reviews");
      if (!Array.isArray(data.entries))
        throw Error("Account reviews could not be read.");
      const parsed = data.entries.map(validateReviewEntry);
      if (parsed.some((e: ReviewEntry | null) => !e))
        throw Error(
          "An account review could not be verified. Your local reviews are still available.",
        );
      setEntries(parsed as ReviewEntry[]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function remove(id: string) {
    setBusy(true);
    setError("");
    try {
      await accountRequest("/account-api/reviews", { id }, "DELETE");
      setEntries((e) => e.filter((r) => r.id !== id));
      setRemoveId("");
      notify({
        title: "Account copy removed",
        description:
          "Copies already opened or saved in a browser are unchanged.",
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="panel account-review-library"
      aria-label="Reviews saved to your account"
    >
      <div className="section-title">
        <div>
          <h2>
            <Cloud size={20} />
            Saved to your account
          </h2>
          <p className="muted">
            Private copies you chose to keep. Available after signing in on
            another device.
          </p>
        </div>
        <button
          className="text-button"
          disabled={busy}
          onClick={() => void load()}
        >
          <RefreshCw size={16} />
          {busy ? "Loading…" : "Refresh account reviews"}
        </button>
      </div>
      {error && (
        <p role="alert" className="notice error-notice">
          {error}
        </p>
      )}
      {!busy && !error && !entries.length && (
        <p className="field-note">
          No account copies yet. Open a review, save your next focus, then
          choose Save to account.
        </p>
      )}
      {entries.map((entry) => (
        <article key={entry.id} className="account-review-row">
          <div>
            <strong>{entry.name}</strong>
            <p className="field-note">
              {entry.strategyName} · {entry.review.session.positions.length}{" "}
              positions · {new Date(entry.savedAt).toLocaleDateString("en-IN")}
            </p>
          </div>
          <div className="account-review-actions">
            <button
              className="text-button"
              disabled={busy}
              onClick={() => onOpen(entry)}
            >
              Open account review <ArrowRight size={15} />
            </button>
            <button
              className="icon-button"
              disabled={busy}
              aria-label={`Remove account copy: ${entry.name}`}
              onClick={() => setRemoveId(removeId === entry.id ? "" : entry.id)}
            >
              <Trash2 size={16} />
            </button>
          </div>
          {removeId === entry.id && (
            <div className="account-review-confirm" role="alert">
              <p>
                Remove this account copy? It cannot be restored from your
                account. Browser copies stay available.
              </p>
              <button
                className="secondary"
                disabled={busy}
                onClick={() => void remove(entry.id)}
              >
                Remove account copy
              </button>
              <button
                className="text-button"
                disabled={busy}
                onClick={() => setRemoveId("")}
              >
                Cancel
              </button>
            </div>
          )}
        </article>
      ))}
    </section>
  );
}

export function CompletedReviewBackups({
  entries,
}: {
  entries: ReviewEntry[];
}) {
  const [id, setId] = useState(entries[0]?.id ?? "");
  const selected = entries.find((e) => e.id === id);
  if (!selected) return null;
  return (
    <details className="account-completed-backup">
      <summary>Keep your saved reviews before leaving</summary>
      <p className="field-note">
        Leaving clears this browser session. You can save an account copy now,
        or export your review locally.
      </p>
      <label>
        Saved review
        <select value={id} onChange={(e) => setId(e.target.value)}>
          {entries.map((e) => (
            <option value={e.id} key={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </label>
      <AccountReviewSave key={selected.id} entry={selected} saved />
      <button
        className="text-button"
        onClick={() => downloadJson("trade-review.json", selected)}
      >
        Download review JSON
      </button>
    </details>
  );
}

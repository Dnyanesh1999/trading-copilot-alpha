import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, Eye, EyeOff, LogOut } from "lucide-react";
import { study } from "./client";
export type EntryConfig = {
  mode: string;
  consentVersion: string;
  information: string | null;
  googleSignIn?: boolean;
  accountLogin?: boolean;
  emailRecovery?: boolean;
};
type Account = { id: string; name: string; email: string };
export async function accountRequest(
  path: string,
  body?: unknown,
  method: "POST" | "DELETE" = "POST",
) {
  const r = await fetch(path, {
    method: body === undefined ? "GET" : method,
    credentials: "same-origin",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(20000),
  });
  let data;
  try {
    data = await r.json();
  } catch {
    throw Error("Could not connect. Please retry.");
  }
  if (!r.ok)
    throw Error(
      data.message ??
        data.error ??
        "Could not complete this request. Please retry.",
    );
  return data;
}
export async function signOutAccount() {
  await accountRequest("/api/auth/sign-out", {});
  study.clear();
}
export function AccountEntry({
  config,
  onJoin,
}: {
  config: EntryConfig;
  onJoin: () => void;
}) {
  const [user, setUser] = useState<Account | null>(null),
    [checking, setChecking] = useState(true),
    [creating, setCreating] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [style, setStyle] = useState(""),
    [experience, setExperience] = useState(""),
    [device, setDevice] = useState(""),
    [consent, setConsent] = useState(false),
    [notice, setNotice] = useState("");
  useEffect(() => {
    let live = true;
    accountRequest("/account-api/me")
      .then((d) => {
        if (!live) return;
        setUser(d.user);
        if (d.profile) {
          setStyle(d.profile.trading_style);
          setExperience(d.profile.experience);
          setDevice(d.profile.device);
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setChecking(false);
      });
    return () => {
      live = false;
    };
  }, []);
  async function login(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await accountRequest(
        creating ? "/api/auth/sign-up/email" : "/api/auth/sign-in/email",
        {
          email: email.trim(),
          password,
          ...(creating
            ? { name: name.trim(), callbackURL: location.origin + "/?study=1" }
            : {}),
        },
      );
      if (creating && config.emailRecovery) {
        setPassword("");
        setCreating(false);
        setNotice(
          "Check your inbox to verify your email, then return to sign in.",
        );
        return;
      }
      const d = await accountRequest("/account-api/me");
      if (!d.user) throw Error("Sign-in could not be confirmed. Please retry.");
      setUser(d.user);
      setPassword("");
      if (d.profile) {
        setStyle(d.profile.trading_style);
        setExperience(d.profile.experience);
        setDevice(d.profile.device);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function google() {
    setBusy(true);
    setError("");
    try {
      const d = await accountRequest("/api/auth/sign-in/social", {
        provider: "google",
        callbackURL: location.origin + "/?study=1",
      });
      if (
        typeof d.url !== "string" ||
        !d.url.startsWith("https://accounts.google.com/")
      )
        throw Error("Google sign-in could not start. Please retry.");
      location.assign(d.url);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  async function start(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const session = await accountRequest("/account-api/start-review", {
        tradingStyle: style,
        experience,
        device,
        consent,
        consentVersion: config.consentVersion,
      });
      study.begin(session);
      onJoin();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    setBusy(true);
    setError("");
    try {
      await signOutAccount();
      setUser(null);
      setConsent(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const reset = new URLSearchParams(location.search).has("reset");
  if (reset) return <PasswordRecovery enabled={!!config.emailRecovery} />;
  return (
    <main className="study-page account-page">
      <a className="study-brand" href="?study=1">
        ◩ Trading Copilot
      </a>
      <section className="panel study-card account-card">
        <span className="study-eyebrow">Your rules. A clearer review.</span>
        <h1>
          {checking
            ? "Welcome to Trading Copilot"
            : user
              ? `Welcome, ${user.name.split(" ")[0]}.`
              : creating
                ? "Create your account."
                : "Welcome back."}
        </h1>
        {checking ? (
          <p role="status">Checking your sign-in…</p>
        ) : user ? (
          <>
            <p className="muted">
              A little about your trading, then you’re ready to review.
            </p>
            <div className="account-signed-in">
              <span>{user.email}</span>
              <button
                className="text-button"
                disabled={busy}
                onClick={() => void logout()}
              >
                <LogOut size={14} />
                Sign out
              </button>
            </div>
            <form onSubmit={(e) => void start(e)}>
              <label>
                Trading style
                <select
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
                  value={device}
                  onChange={(e) => setDevice(e.target.value)}
                  required
                >
                  <option value="">Choose this device</option>
                  <option value="desktop">Desktop / laptop</option>
                  <option value="mobile">Mobile</option>
                </select>
              </label>
              <details className="account-information" open>
                <summary>
                  {config.mode === "participant"
                    ? "About this study"
                    : "About this practice review"}
                </summary>
                {config.mode === "participant" ? (
                  config.information
                    ?.split("\n")
                    .filter(Boolean)
                    .map((p, i) => <p key={i}>{p}</p>)
                ) : (
                  <>
                    <p>
                      This is an internal rehearsal using fictional strategies
                      and trades. Real participant sessions are not enabled yet.
                    </p>
                    <p>
                      Your name and email stay in private account records. After
                      you agree below, coded activity, task responses and
                      feedback are stored for the researcher. Study CSV exports
                      exclude your account name and email.
                    </p>
                    <p>
                      Your original CSV and unsaved work stay in this browser
                      session. You can separately choose Save to account to
                      store an encrypted private review copy, including its
                      trade records, rules and next focus. Account copies can be
                      removed in History. AI clarification sends your strategy
                      text and answers to Google through our server. Please
                      leave identifying details out.
                    </p>
                    <p>
                      You can stop a review at any time. Final participant
                      information, retention and withdrawal arrangements must be
                      agreed before real trader testing.
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
                  {config.mode === "participant"
                    ? "I have read the participant information and agree to take part."
                    : "I understand this is a fictional practice session and agree to the described recording."}
                </span>
              </label>
              <button
                className="primary"
                disabled={busy || !consent || !style || !experience || !device}
              >
                {busy ? "Starting…" : "Start my review"}
                <ArrowRight size={16} />
              </button>
            </form>
          </>
        ) : (
          <>
            <p className="muted">
              {creating
                ? "Create a private account to start your review."
                : "Sign in to continue your trade review."}
            </p>
            {config.googleSignIn && (
              <>
                <button
                  className="secondary account-google"
                  disabled={busy}
                  onClick={() => void google()}
                >
                  <span aria-hidden="true">G</span>Continue with Google
                </button>
                <div className="account-divider">
                  <span>or use email</span>
                </div>
              </>
            )}
            <form onSubmit={(e) => void login(e)}>
              {creating && (
                <label>
                  Your name
                  <input
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    minLength={1}
                    maxLength={80}
                    required
                  />
                </label>
              )}
              <label>
                Email
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  maxLength={254}
                  required
                />
              </label>
              <label>
                Password
                <div className="account-password">
                  <input
                    aria-label="Password"
                    aria-describedby={creating ? "password-help" : undefined}
                    type={showPassword ? "text" : "password"}
                    autoComplete={
                      creating ? "new-password" : "current-password"
                    }
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={creating ? 12 : 1}
                    maxLength={128}
                    required
                  />
                  <button
                    className="icon-button"
                    type="button"
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {creating && (
                  <small id="password-help">At least 12 characters.</small>
                )}
              </label>
              <button className="primary" disabled={busy}>
                {busy
                  ? "Please wait…"
                  : creating
                    ? "Create account"
                    : "Sign in"}
                <ArrowRight size={16} />
              </button>
            </form>
            {config.emailRecovery && !creating && (
              <div className="account-recovery-links">
                <a href="?study=1&reset=1">Forgot password?</a>
                <button
                  className="text-button"
                  disabled={busy || !email.includes("@")}
                  onClick={async () => {
                    setBusy(true);
                    setError("");
                    try {
                      await accountRequest(
                        "/api/auth/send-verification-email",
                        {
                          email: email.trim(),
                          callbackURL: location.origin + "/?study=1",
                        },
                      );
                      setNotice(
                        "If this account needs verification, check your email for a link.",
                      );
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Resend verification email
                </button>
              </div>
            )}
            <p className="account-switch">
              {creating ? "Already have an account?" : "New here?"}{" "}
              <button
                className="text-button"
                disabled={busy}
                onClick={() => {
                  setCreating(!creating);
                  setError("");
                  setPassword("");
                }}
              >
                {creating ? "Sign in" : "Create an account"}
              </button>
            </p>
            <p className="field-note">
              Your name and email are used for your private account. Sign-in
              also uses security session information. Study activity recording
              starts after you agree on the next screen.
              {config.emailRecovery &&
                " Verification and password recovery emails are delivered by Brevo; your recipient email and secure account link are sent to Brevo. Trade records are not included."}
            </p>
          </>
        )}
        {notice && (
          <p role="status" className="notice">
            {notice}
          </p>
        )}
        {error && (
          <p role="alert" className="notice error-notice">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}

function PasswordRecovery({ enabled }: { enabled: boolean }) {
  const [token] = useState(
    () => new URLSearchParams(location.search).get("token") ?? "",
  );
  const [invalid] = useState(
    () => new URLSearchParams(location.search).get("error") ?? "",
  );
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [again, setAgain] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [done, setDone] = useState(false);
  useEffect(() => {
    const clean = new URL(location.href);
    clean.searchParams.delete("token");
    clean.searchParams.delete("error");
    history.replaceState(null, "", clean);
  }, []);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (token) {
        if (password !== again) throw Error("Passwords do not match.");
        await accountRequest("/api/auth/reset-password", {
          token,
          newPassword: password,
        });
        setPassword("");
        setAgain("");
        setDone(true);
        setNotice(
          "Password updated. Sign in with your new password; previous sessions have been signed out.",
        );
      } else {
        await accountRequest("/api/auth/request-password-reset", {
          email: email.trim(),
          redirectTo: location.origin + "/?study=1&reset=1",
        });
        setNotice(
          "If an account exists for this email, a reset link has been requested. Check your inbox and spam folder.",
        );
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="study-page account-page">
      <a className="study-brand" href="?study=1">
        ◩ Trading Copilot
      </a>
      <section className="panel study-card account-card">
        <h1>{token ? "Choose a new password." : "Reset your password."}</h1>
        {!enabled ? (
          <p>
            Email recovery is not enabled yet. If you use Google sign-in,
            recover access through your Google account.
          </p>
        ) : done ? null : invalid ? (
          <p role="alert">
            This reset link is invalid or expired.{" "}
            <a href="?study=1&reset=1">Request another link</a>.
          </p>
        ) : (
          <form onSubmit={(e) => void submit(e)}>
            {token ? (
              <>
                <label>
                  New password
                  <input
                    aria-label="New password"
                    type="password"
                    autoComplete="new-password"
                    minLength={12}
                    maxLength={128}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </label>
                <label>
                  Confirm new password
                  <input
                    type="password"
                    autoComplete="new-password"
                    minLength={12}
                    maxLength={128}
                    value={again}
                    onChange={(e) => setAgain(e.target.value)}
                    required
                  />
                </label>
                <p className="field-note">
                  At least 12 characters. A successful reset signs out previous
                  sessions.
                </p>
              </>
            ) : (
              <label>
                Email
                <input
                  type="email"
                  autoComplete="email"
                  maxLength={254}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </label>
            )}
            <button className="primary" disabled={busy}>
              {busy
                ? "Please wait…"
                : token
                  ? "Update password"
                  : "Send reset link"}
            </button>
          </form>
        )}
        {notice && (
          <p role="status" className="notice">
            {notice}
          </p>
        )}
        {error && (
          <p role="alert" className="notice error-notice">
            {error}
          </p>
        )}
        <p>
          <a
            href="?study=1"
            onClick={() => {
              if (done) study.clear();
            }}
          >
            Back to sign in
          </a>
        </p>
      </section>
    </main>
  );
}

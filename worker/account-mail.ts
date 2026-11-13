export interface AccountMailEnv {
  BREVO_API_KEY?: string;
  ACCOUNT_MAIL_FROM?: string;
  PUBLIC_ORIGIN: string;
}
export const mailReady = (env: AccountMailEnv) =>
  !!env.BREVO_API_KEY &&
  !!env.ACCOUNT_MAIL_FROM &&
  /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(env.ACCOUNT_MAIL_FROM);
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export async function sendAccountMail(
  env: AccountMailEnv,
  to: string,
  url: string,
  kind: "verify" | "reset",
  transport: typeof fetch = fetch,
) {
  if (!mailReady(env)) throw Error("Account email delivery is unavailable.");
  const link = new URL(url);
  if (
    link.origin !== env.PUBLIC_ORIGIN ||
    !link.pathname.startsWith("/api/auth/")
  )
    throw Error("Invalid account email link.");
  const reset = kind === "reset",
    title = reset
      ? "Reset your Trading Copilot password"
      : "Verify your Trading Copilot email";
  const text = `${title}\n\n${reset ? "Use this link within 30 minutes to choose a new password." : "Use this link within one hour to verify your email."}\n${url}\n\nIf you did not request this, ignore this message. Never share this link.\nTrading Copilot`;
  const response = await transport("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": env.BREVO_API_KEY!,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      sender: { name: "Trading Copilot", email: env.ACCOUNT_MAIL_FROM },
      to: [{ email: to }],
      subject: title,
      textContent: text,
      htmlContent: `<h1>${title}</h1><p>${reset ? "Choose a new password using the link below. It expires in 30 minutes." : "Confirm your email using the link below. It expires in one hour."}</p><p><a href="${escape(url)}">${reset ? "Reset password" : "Verify email"}</a></p><p>If you did not request this, ignore this message. Never share this link.</p>`,
    }),
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok)
    throw Error("Account email could not be delivered. Please retry later.");
}

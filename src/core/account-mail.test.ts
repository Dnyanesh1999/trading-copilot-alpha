import { describe, it, expect, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { betterAuth } from "better-auth";
import { authOptions } from "../../worker/auth";
import { mailReady, sendAccountMail } from "../../worker/account-mail";
const origin = "http://localhost:9911";
const env = {
  AUTH_DB: {} as never,
  AUTH_SECRET: "synthetic-test-secret-at-least-32-characters",
  PUBLIC_ORIGIN: origin,
  BREVO_API_KEY: "synthetic-key",
  ACCOUNT_MAIL_FROM: "sender@example.invalid",
};
describe("Account recovery delivery", () => {
  it("stays disabled without complete sender setup", () => {
    expect(mailReady({ ...env, BREVO_API_KEY: undefined })).toBe(false);
    expect(mailReady({ ...env, ACCOUNT_MAIL_FROM: "invalid" })).toBe(false);
  });
  it("sends text and HTML only to the intended recipient and hides provider errors", async () => {
    const transport = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response("{}", { status: 201 }),
    );
    await sendAccountMail(
      env,
      "recipient@example.invalid",
      origin + "/api/auth/verify-email?token=fake&callbackURL=%22",
      "verify",
      transport,
    );
    const body = JSON.parse(String(transport.mock.calls[0][1]?.body));
    expect(body.to).toEqual([{ email: "recipient@example.invalid" }]);
    expect(body.textContent).toContain("Trading Copilot");
    expect(body.htmlContent).toContain("&amp;");
    await expect(
      sendAccountMail(
        env,
        "recipient@example.invalid",
        origin + "/api/auth/reset-password/fake",
        "reset",
        async () => new Response("private-provider-detail", { status: 500 }),
      ),
    ).rejects.toThrow(
      "Account email could not be delivered. Please retry later.",
    );
  });
  it("rejects links outside the app before contacting a provider", async () => {
    const transport = vi.fn();
    await expect(
      sendAccountMail(
        env,
        "recipient@example.invalid",
        "https://untrusted.invalid/api/auth/reset-password/fake",
        "reset",
        transport,
      ),
    ).rejects.toThrow();
    expect(transport).not.toHaveBeenCalled();
  });
  it("verifies email, rejects reset replay/expiry and revokes old sessions", async () => {
    const db = new DatabaseSync(":memory:");
    db.exec(
      readFileSync(
        new URL(
          "../../worker/auth-migrations/0001_accounts.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const mails: { url: string; kind: string }[] = [];
    const options = authOptions(env);
    const auth = betterAuth({
      ...options,
      database: db,
      // Isolate recovery semantics from the production login-attempt throttle.
      rateLimit: { enabled: false },
      emailVerification: {
        ...options.emailVerification,
        sendVerificationEmail: async (data) => {
          mails.push({ url: data.url, kind: "verify" });
        },
      },
      emailAndPassword: {
        ...options.emailAndPassword,
        sendResetPassword: async (data) => {
          mails.push({ url: data.url, kind: "reset" });
        },
      },
    });
    const call = (path: string, body?: unknown, cookie = "") =>
      auth.handler(
        new Request(origin + "/api/auth" + path, {
          method: body === undefined ? "GET" : "POST",
          headers: {
            Origin: origin,
            ...(body === undefined
              ? {}
              : { "Content-Type": "application/json" }),
            ...(cookie ? { Cookie: cookie } : {}),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        }),
      );
    const credentials = {
      name: "Fictional Recovery QA",
      email: "recovery@example.invalid",
      password: "synthetic-old-password-123",
    };
    expect((await call("/sign-up/email", credentials)).status).toBe(200);
    expect(mails.filter((m) => m.kind === "verify")).toHaveLength(1);
    expect((await call("/sign-in/email", credentials)).status).toBe(403);
    expect((await auth.handler(new Request(mails[0].url))).status).toBe(302);
    const login = await call("/sign-in/email", credentials);
    expect(login.status).toBe(200);
    const cookie = login.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    expect(
      (await (await call("/get-session", undefined, cookie)).json())?.user
        ?.emailVerified,
    ).toBe(true);
    const reset = {
      email: credentials.email,
      redirectTo: origin + "/?study=1&reset=1",
    };
    expect((await call("/request-password-reset", reset)).status).toBe(200);
    const link = mails.find((m) => m.kind === "reset")!.url;
    const callback = await auth.handler(new Request(link));
    expect(callback.status).toBe(302);
    const token = new URL(callback.headers.get("location")!).searchParams.get(
      "token",
    )!;
    expect(
      (
        await call("/reset-password", {
          token,
          newPassword: "synthetic-new-password-456",
        })
      ).status,
    ).toBe(200);
    expect(
      await (await call("/get-session", undefined, cookie)).json(),
    ).toBeNull();
    expect((await call("/sign-in/email", credentials)).status).toBe(401);
    expect(
      (
        await call("/sign-in/email", {
          ...credentials,
          password: "synthetic-new-password-456",
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await call("/reset-password", {
          token,
          newPassword: "synthetic-replay-password-789",
        })
      ).status,
    ).toBe(400);
    const before = mails.length;
    expect(
      (
        await call("/request-password-reset", {
          ...reset,
          email: "missing@example.invalid",
        })
      ).status,
    ).toBe(200);
    expect(mails.length).toBe(before);
    await call("/request-password-reset", reset);
    const expired = mails
      .at(-1)!
      .url.split("/reset-password/")[1]
      .split("?")[0];
    db.prepare(
      "UPDATE auth_verification SET expiresAt=? WHERE identifier=?",
    ).run(Date.now() - 60000, "reset-password:" + expired);
    expect(
      (
        await call("/reset-password", {
          token: expired,
          newPassword: "synthetic-expired-password",
        })
      ).status,
    ).toBe(400);
    db.close();
  }, 15000);
});

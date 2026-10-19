import { betterAuth } from "better-auth";
export interface AccountEnv {
  AUTH_DB: D1Database;
  AUTH_SECRET: string;
  PUBLIC_ORIGIN: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
}
export function authOptions(env: AccountEnv) {
  return {
    appName: "Trading Copilot",
    baseURL: env.PUBLIC_ORIGIN,
    basePath: "/api/auth",
    secret: env.AUTH_SECRET,
    database: env.AUTH_DB,
    trustedOrigins: [env.PUBLIC_ORIGIN],
    logger: { disabled: true },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
    },
    user: { modelName: "auth_user" },
    session: { modelName: "auth_session", expiresIn: 60 * 60 * 24 * 7 },
    account: { modelName: "auth_account", accountLinking: { enabled: false } },
    verification: { modelName: "auth_verification" },
    rateLimit: {
      enabled: true,
      storage: "database" as const,
      modelName: "auth_rate_limit",
      window: 60,
      max: 50,
    },
    advanced: { ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] } },
    socialProviders:
      env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? {
            google: {
              clientId: env.GOOGLE_CLIENT_ID,
              clientSecret: env.GOOGLE_CLIENT_SECRET,
            },
          }
        : {},
  };
}
export const createAuth = (env: AccountEnv) => betterAuth(authOptions(env));

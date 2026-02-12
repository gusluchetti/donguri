/**
 * Environment access — reads from process.env.
 * Works for both local dev (.env) and production (Fly.io secrets).
 */

interface AppEnv {
  /** ES256 private key — JWK JSON string */
  OAUTH_PRIVATE_KEY_JWK: string;
  SESSION_SECRET: string;
  PUBLIC_URL: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
}

let _env: AppEnv | null = null;

export function getEnv(): AppEnv {
  if (_env) return _env;

  _env = {
    OAUTH_PRIVATE_KEY_JWK: process.env.OAUTH_PRIVATE_KEY_JWK || "",
    SESSION_SECRET:
      process.env.SESSION_SECRET ||
      (process.env.NODE_ENV === "production"
        ? (() => {
            throw new Error("SESSION_SECRET must be set in production");
          })()
        : "dev-secret-change-me"),
    PUBLIC_URL: (process.env.PUBLIC_URL || "http://localhost:3000").replace(/\/+$/, ""),
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || "",
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || "",
    GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID || "",
    GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET || "",
  };

  return _env;
}

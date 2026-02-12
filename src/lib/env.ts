/**
 * Environment access — reads from process.env on every call.
 * Works for both local dev (.env via Vite) and production (Fly.io secrets).
 *
 * No caching — avoids stale values if env isn't loaded yet at import time.
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

export function getEnv(): AppEnv {
  return {
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
}

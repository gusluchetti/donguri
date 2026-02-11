/**
 * Environment access — reads from process.env.
 * Works for both local dev (.env) and production (Fly.io secrets).
 */

interface AppEnv {
  /** ES256 private key — JWK JSON string */
  OAUTH_PRIVATE_KEY_JWK: string;
  SESSION_SECRET: string;
  PUBLIC_URL: string;
}

let _env: AppEnv | null = null;

export function getEnv(): AppEnv {
  if (_env) return _env;

  _env = {
    OAUTH_PRIVATE_KEY_JWK: process.env.OAUTH_PRIVATE_KEY_JWK || "",
    SESSION_SECRET: process.env.SESSION_SECRET || "dev-secret-change-me-in-production-please",
    PUBLIC_URL: process.env.PUBLIC_URL || "http://localhost:3000",
  };

  return _env;
}

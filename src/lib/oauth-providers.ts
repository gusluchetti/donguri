/**
 * Generic OAuth provider config + flow.
 *
 * Each provider is described by a config object. The authorization URL is
 * built generically; code exchange stays provider-specific because the
 * token responses genuinely differ (Google: JWT id_token, GitHub: bearer +
 * API call).
 */
import type { Column } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { cleanEnv, getDb } from "../db";
import { users } from "../db/schema";
import type { SessionData } from "./auth/session";
import { setSessionCookie } from "./auth/session";

export type Provider = "google" | "github";

interface UserProfile {
  providerId: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
}

interface OAuthProviderConfig {
  name: Provider;
  label: string;
  authEndpoint: string;
  tokenEndpoint: string;
  scope: string;
  clientIdEnv: string;
  clientSecretEnv: string;
  callbackPath: string;
  idColumn: Column;
  extraAuthParams?: Record<string, string>;
  exchangeCode: (code: string, redirectUri: string) => Promise<UserProfile>;
}

// ─── Provider-specific code exchange ────────────────────────────────────────

async function exchangeGoogleCode(code: string, redirectUri: string): Promise<UserProfile> {
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: cleanEnv(process.env.GOOGLE_CLIENT_ID),
      client_secret: cleanEnv(process.env.GOOGLE_CLIENT_SECRET),
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    console.error("[oauth:google] token exchange failed:", text);
    throw new Error("Google token exchange failed");
  }

  const { id_token } = (await tokenRes.json()) as { id_token: string };

  // Decode JWT payload (no verification needed — we trust Google's TLS + we just fetched it)
  // Use TextDecoder to handle UTF-8 names correctly (atob mangles multi-byte chars like í)
  const b64 = id_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const payload = JSON.parse(new TextDecoder().decode(bytes));

  return {
    providerId: payload.sub,
    name: payload.name || payload.email?.split("@")[0] || "User",
    email: payload.email || null,
    avatarUrl: payload.picture || null,
  };
}

async function exchangeGitHubCode(code: string, redirectUri: string): Promise<UserProfile> {
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: cleanEnv(process.env.GITHUB_CLIENT_ID),
      client_secret: cleanEnv(process.env.GITHUB_CLIENT_SECRET),
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    console.error("[oauth:github] token exchange failed:", text);
    throw new Error("GitHub token exchange failed");
  }

  const { access_token, error } = (await tokenRes.json()) as {
    access_token?: string;
    error?: string;
  };
  if (error || !access_token) {
    console.error("[oauth:github] token error:", error);
    throw new Error("GitHub token exchange failed");
  }

  const userRes = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${access_token}`,
      Accept: "application/vnd.github+json",
    },
  });

  if (!userRes.ok) {
    throw new Error("GitHub user fetch failed");
  }

  const user = (await userRes.json()) as {
    id: number;
    login: string;
    name: string | null;
    email: string | null;
    avatar_url: string | null;
  };

  return {
    providerId: String(user.id),
    name: user.name || user.login,
    email: user.email,
    avatarUrl: user.avatar_url,
  };
}

// ─── Provider configs ───────────────────────────────────────────────────────

const PROVIDERS: Record<Provider, OAuthProviderConfig> = {
  google: {
    name: "google",
    label: "Google",
    authEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenEndpoint: "https://oauth2.googleapis.com/token",
    scope: "openid email profile",
    clientIdEnv: "GOOGLE_CLIENT_ID",
    clientSecretEnv: "GOOGLE_CLIENT_SECRET",
    callbackPath: "/auth/google/callback",
    idColumn: users.googleId,
    extraAuthParams: { access_type: "online", prompt: "select_account" },
    exchangeCode: exchangeGoogleCode,
  },
  github: {
    name: "github",
    label: "GitHub",
    authEndpoint: "https://github.com/login/oauth/authorize",
    tokenEndpoint: "https://github.com/login/oauth/access_token",
    scope: "read:user user:email",
    clientIdEnv: "GITHUB_CLIENT_ID",
    clientSecretEnv: "GITHUB_CLIENT_SECRET",
    callbackPath: "/auth/github/callback",
    idColumn: users.githubId,
    exchangeCode: exchangeGitHubCode,
  },
};

// ─── Generic auth URL builder ───────────────────────────────────────────────

export function getAuthUrl(provider: Provider, state: string): string {
  const config = PROVIDERS[provider];
  const publicUrl = (cleanEnv(process.env.PUBLIC_URL) || "https://dev.donguri.app").replace(
    /\/+$/,
    "",
  );
  const params = new URLSearchParams({
    client_id: cleanEnv(process.env[config.clientIdEnv]),
    redirect_uri: `${publicUrl}${config.callbackPath}`,
    scope: config.scope,
    state,
    ...config.extraAuthParams,
  });
  // Google expects response_type
  if (provider === "google") params.set("response_type", "code");
  return `${config.authEndpoint}?${params}`;
}

// ─── Unified callback handler ───────────────────────────────────────────────

export async function handleProviderCallback(
  provider: Provider,
  code: string,
): Promise<SessionData> {
  const config = PROVIDERS[provider];
  const publicUrl = (cleanEnv(process.env.PUBLIC_URL) || "https://dev.donguri.app").replace(
    /\/+$/,
    "",
  );
  const redirectUri = `${publicUrl}${config.callbackPath}`;

  const profile = await config.exchangeCode(code, redirectUri);

  const isDev = process.env.NODE_ENV === "development";
  if (isDev) console.debug("[oauth:%s] profile: %o", provider, { ...profile, avatarUrl: "..." });

  const db = getDb();
  const { idColumn } = config;

  // 1. Look up existing user by provider ID (exact match)
  const [byProviderId] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(idColumn, profile.providerId))
    .limit(1);

  let userId: string;
  let handle: string;

  if (byProviderId) {
    // Returning user — update profile
    userId = byProviderId.id;
    handle = profile.name;
    await db
      .update(users)
      .set({
        handle: profile.name,
        email: profile.email,
        avatarUrl: profile.avatarUrl,
      })
      .where(eq(users.id, userId));
    if (isDev) console.debug("[oauth:%s] returning user: %s", provider, userId);
  } else if (profile.email) {
    // 2. Try email-based auto-link: attach this provider to an existing account
    const [byEmail] = await db
      .select({ id: users.id, authMethod: users.authMethod })
      .from(users)
      .where(eq(users.email, profile.email))
      .limit(1);

    if (byEmail) {
      userId = byEmail.id;
      handle = profile.name;
      await db
        .update(users)
        .set({ avatarUrl: profile.avatarUrl, [idColumn.name]: profile.providerId })
        .where(eq(users.id, userId));
      if (isDev)
        console.debug(
          "[oauth:%s] linked to existing user %s (matched by email %s)",
          provider,
          userId,
          profile.email,
        );
    } else {
      // 3. Brand new user
      const [newUser] = await db
        .insert(users)
        .values({
          handle: profile.name,
          authMethod: provider,
          email: profile.email,
          avatarUrl: profile.avatarUrl,
          [idColumn.name]: profile.providerId,
        } as typeof users.$inferInsert)
        .returning({ id: users.id });
      userId = newUser.id;
      handle = profile.name;
      if (isDev) console.debug("[oauth:%s] created new user: %s", provider, userId);
    }
  } else {
    // No email from provider — create new user without linking
    const [newUser] = await db
      .insert(users)
      .values({
        handle: profile.name,
        authMethod: provider,
        avatarUrl: profile.avatarUrl,
        [idColumn.name]: profile.providerId,
      } as typeof users.$inferInsert)
      .returning({ id: users.id });
    userId = newUser.id;
    handle = profile.name;
    if (isDev) console.debug("[oauth:%s] created new user (no email): %s", provider, userId);
  }

  const session: SessionData = { userId, handle, authMethod: provider };
  await setSessionCookie(session);
  return session;
}

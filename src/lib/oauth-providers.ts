/**
 * Google + GitHub OAuth helpers.
 *
 * Lightweight Authorization Code flow — no heavy libraries.
 * Each provider is 2 HTTP calls: exchange code → get profile.
 */
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { users } from "../db/schema";
import type { SessionData } from "./auth/session";
import { setSessionCookie } from "./auth/session";
import { getEnv } from "./env";

type Provider = "google" | "github";

interface UserProfile {
  providerId: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
}

// ─── Auth URL builders ──────────────────────────────────────────────────────

export function getGoogleAuthUrl(state: string): string {
  const env = getEnv();
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: `${env.PUBLIC_URL}/auth/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export function getGitHubAuthUrl(state: string): string {
  const env = getEnv();
  const params = new URLSearchParams({
    client_id: env.GITHUB_CLIENT_ID,
    redirect_uri: `${env.PUBLIC_URL}/auth/github/callback`,
    scope: "read:user user:email",
    state,
  });
  return `https://github.com/login/oauth/authorize?${params}`;
}

// ─── Token exchange + profile fetch ──────────────────────────────────────────

async function exchangeGoogleCode(code: string): Promise<UserProfile> {
  const env = getEnv();

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${env.PUBLIC_URL}/auth/google/callback`,
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
  const payload = JSON.parse(atob(id_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));

  return {
    providerId: payload.sub,
    name: payload.name || payload.email?.split("@")[0] || "User",
    email: payload.email || null,
    avatarUrl: payload.picture || null,
  };
}

async function exchangeGitHubCode(code: string): Promise<UserProfile> {
  const env = getEnv();

  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: `${env.PUBLIC_URL}/auth/github/callback`,
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

// ─── Unified callback handler ────────────────────────────────────────────────

export async function handleProviderCallback(
  provider: Provider,
  code: string,
): Promise<SessionData> {
  const profile =
    provider === "google" ? await exchangeGoogleCode(code) : await exchangeGitHubCode(code);

  const isDev = process.env.NODE_ENV === "development";
  if (isDev) console.debug("[oauth:%s] profile: %o", provider, { ...profile, avatarUrl: "..." });

  const db = getDb();
  const idColumn = provider === "google" ? users.googleId : users.githubId;

  // Look up existing user by provider ID
  const [existing] = await db
    .select({ id: users.id, handle: users.handle })
    .from(users)
    .where(eq(idColumn, profile.providerId))
    .limit(1);

  let userId: string;
  let handle: string;

  if (existing) {
    userId = existing.id;
    handle = profile.name;
    await db
      .update(users)
      .set({
        handle: profile.name,
        email: profile.email,
        avatarUrl: profile.avatarUrl,
      })
      .where(eq(users.id, userId));
    if (isDev) console.debug("[oauth:%s] updated existing user: %s", provider, userId);
  } else {
    const values: Record<string, unknown> = {
      handle: profile.name,
      authMethod: provider,
      email: profile.email,
      avatarUrl: profile.avatarUrl,
    };
    if (provider === "google") values.googleId = profile.providerId;
    else values.githubId = profile.providerId;

    const [newUser] = await db
      .insert(users)
      .values(values as typeof users.$inferInsert)
      .returning({ id: users.id });
    userId = newUser.id;
    handle = profile.name;
    if (isDev) console.debug("[oauth:%s] created new user: %s", provider, userId);
  }

  const session: SessionData = { userId, handle, authMethod: provider };
  await setSessionCookie(session);
  return session;
}

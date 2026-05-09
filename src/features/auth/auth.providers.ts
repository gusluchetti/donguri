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
import { getDb } from "~/db";
import { users } from "~/db/schema";
import type { SessionData } from "~/features/auth/auth.session";
import { setSessionCookie } from "~/features/auth/auth.session";
import { cleanEnv, getPublicUrl } from "~/lib/env";
import { log } from "~/lib/logger";

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
  idKey: keyof typeof users.$inferInsert;
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
    name: payload.email?.split("@")[0] || "User",
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

  // /user only returns public email — fetch primary verified email if missing
  let email = user.email;
  if (!email) {
    try {
      const emailsRes = await fetch("https://api.github.com/user/emails", {
        headers: {
          Authorization: `Bearer ${access_token}`,
          Accept: "application/vnd.github+json",
        },
      });
      if (emailsRes.ok) {
        const emails = (await emailsRes.json()) as {
          email: string;
          primary: boolean;
          verified: boolean;
        }[];
        email = emails.find((e) => e.primary && e.verified)?.email ?? null;
      }
    } catch {
      // Non-critical — continue without email
    }
  }

  return {
    providerId: String(user.id),
    name: user.login,
    email,
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
    idKey: "googleId",
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
    idKey: "githubId",
    exchangeCode: exchangeGitHubCode,
  },
};

// ─── Generic auth URL builder ───────────────────────────────────────────────

export function getAuthUrl(provider: Provider, state: string): string {
  const config = PROVIDERS[provider];
  const publicUrl = getPublicUrl();
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
  const publicUrl = getPublicUrl();
  const redirectUri = `${publicUrl}${config.callbackPath}`;

  const profile = await config.exchangeCode(code, redirectUri);

  log.debug("[oauth] provider callback received for:", provider, "profile:", profile);

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
  let isNewUser = false;

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
    log.debug("[oauth] updated existing user with provider ID:", profile.providerId);
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
        .set({ avatarUrl: profile.avatarUrl, [config.idKey]: profile.providerId })
        .where(eq(users.id, userId));
      log.debug("[oauth] auto-linked email to existing user:", profile.email);
    } else {
      // 3. Brand new user
      const [newUser] = await db
        .insert(users)
        .values({
          handle: profile.name,
          authMethod: provider,
          email: profile.email,
          avatarUrl: profile.avatarUrl,
          [config.idKey]: profile.providerId,
        } as typeof users.$inferInsert)
        .returning({ id: users.id });
      userId = newUser.id;
      handle = profile.name;
      isNewUser = true;
      log.debug("[oauth] created new user with email:", profile.email);
    }
  } else {
    // No email from provider — create new user without linking
    const [newUser] = await db
      .insert(users)
      .values({
        handle: profile.name,
        authMethod: provider,
        avatarUrl: profile.avatarUrl,
        [config.idKey]: profile.providerId,
      } as typeof users.$inferInsert)
      .returning({ id: users.id });
    userId = newUser.id;
    handle = profile.name;
    isNewUser = true;
    log.debug("[oauth] created new user without email for provider:", provider);
  }

  const { getUserSubscriptionTier } = await import("~/features/subscription/subscription.server");
  const tier = !isNewUser ? await getUserSubscriptionTier(userId) : null;

  const session: SessionData = { userId, handle, authMethod: provider, tier };
  await setSessionCookie(session);
  return session;
}

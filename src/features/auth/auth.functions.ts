import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "~/db";
import { users } from "~/db/schema";
import { getAuthenticatedAgent } from "~/features/auth/auth.agent";
import { getOAuthClient } from "~/features/auth/auth.oauth";
import { getAuthUrl, handleProviderCallback, type Provider } from "~/features/auth/auth.providers";
import { clearSessionCookie, getSessionData, setSessionCookie } from "~/features/auth/auth.session";
import { reconcileUser } from "~/features/auth/auth.sync";
import { cleanEnv } from "~/lib/env";

const isDev = process.env.NODE_ENV === "development";

export type { SessionData } from "~/features/auth/auth.session";

export const getAuthState = createServerFn({ method: "GET" }).handler(async () => {
  // Session cookie is HMAC-signed — no DB round trip needed to verify user existence.
  // If a user is deleted, their cookie becomes invalid at next login.
  return await getSessionData();
});

// ─── Bluesky (AT Protocol) login ──────────────────────────────────────────────

export const initiateLogin = createServerFn({ method: "POST" })
  .inputValidator(z.object({ handle: z.string().min(1) }))
  .handler(async ({ data }) => {
    if (isDev) {
    }

    try {
      const client = await getOAuthClient();
      if (isDev) {
      }
      if (isDev) {
      }
      const url = await client.authorize(data.handle);
      if (isDev) {
      }
      return { url: url.toString() };
    } catch (err) {
      console.error("[login] failed:", err);
      throw new Error("Could not sign in. Please check your handle and try again.");
    }
  });

export const handleOAuthCallback = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      code: z.string().optional(),
      state: z.string().optional(),
      iss: z.string().optional(),
      error: z.string().optional(),
      error_description: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    if (isDev) {
    }

    if (data.error) {
      console.error("[callback] OAuth error from PDS:", data.error, data.error_description);
      throw new Error("Authentication was denied or failed. Please try again.");
    }

    if (!data.code || !data.state) {
      throw new Error("Missing required OAuth parameters (code/state).");
    }

    try {
      const client = await getOAuthClient();
      if (isDev) {
      }

      const params = new URLSearchParams();
      if (data.code) params.set("code", data.code);
      if (data.state) params.set("state", data.state);
      if (data.iss) params.set("iss", data.iss);

      if (isDev) {
      }

      const result = await client.callback(params);
      const did = result.session.did;
      if (isDev) {
      }

      let handle: string = did;
      try {
        if (isDev) {
        }
        const res = await fetch(`https://plc.directory/${encodeURIComponent(did)}`);
        if (res.ok) {
          const doc = (await res.json()) as { alsoKnownAs?: string[] };
          const atUri = doc.alsoKnownAs?.find((u) => u.startsWith("at://"));
          if (atUri) handle = atUri.replace("at://", "");
          if (isDev) {
          }
        }
      } catch (err) {
        console.error("[callback] handle resolution failed:", err);
      }

      const db = getDb();
      const existing = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.did, did))
        .limit(1);

      // Get authenticated agent (reused for email fetch + PDS reconciliation)
      let agent: Awaited<ReturnType<typeof getAuthenticatedAgent>> | null = null;
      let email: string | null = null;
      try {
        agent = await getAuthenticatedAgent(did);
        // Fetch email from PDS (com.atproto.server.getSession includes it)
        const sessionInfo = await agent.com.atproto.server.getSession();
        if (sessionInfo.data.email && sessionInfo.data.emailConfirmed) {
          email = sessionInfo.data.email;
          if (isDev) {
          }
        }
      } catch (err) {
        console.error("[callback] agent/email fetch failed (continuing):", err);
      }

      let userId: string;
      if (existing.length > 0) {
        userId = existing[0].id;
        await db
          .update(users)
          .set({ handle, ...(email ? { email } : {}) })
          .where(eq(users.id, userId));
        if (isDev) {
        }
      } else {
        const [newUser] = await db
          .insert(users)
          .values({ did, handle, authMethod: "atproto", ...(email ? { email } : {}) })
          .returning({ id: users.id });
        userId = newUser.id;
        if (isDev) {
        }
      }

      if (agent) {
        try {
          await reconcileUser(agent, userId, did);
          if (isDev) {
          }
        } catch (err) {
          console.error("[callback] PDS reconciliation failed (login continues):", err);
        }
      }

      const { getUserSubscriptionTier } = await import(
        "~/features/subscription/subscription.server"
      );
      const tier = existing.length > 0 ? await getUserSubscriptionTier(userId) : null;

      await setSessionCookie({ userId, handle, authMethod: "atproto", did, tier });
      if (isDev) {
      }
      return { did, handle };
    } catch (err) {
      console.error("[callback] failed:", err);
      throw err;
    }
  });

// ─── Google / GitHub login ────────────────────────────────────────────────────

const providerSchema = z.enum(["google", "github"]);

const ENV_FOR_PROVIDER: Record<Provider, string> = {
  google: "GOOGLE_CLIENT_ID",
  github: "GITHUB_CLIENT_ID",
};

export const initiateOAuthLogin = createServerFn({ method: "POST" })
  .inputValidator(z.object({ provider: providerSchema }))
  .handler(async ({ data }) => {
    const envVar = ENV_FOR_PROVIDER[data.provider];
    if (!cleanEnv(process.env[envVar])) throw new Error(`${envVar} is not configured`);
    const state = crypto.randomUUID();
    return { url: getAuthUrl(data.provider, state) };
  });

export const handleOAuthProviderCallback = createServerFn({ method: "GET" })
  .inputValidator(z.object({ provider: providerSchema, code: z.string() }))
  .handler(async ({ data }) => {
    return handleProviderCallback(data.provider, data.code);
  });

// ─── Logout ───────────────────────────────────────────────────────────────────

export const logout = createServerFn({ method: "POST" }).handler(async () => {
  if (isDev) {
  }
  const session = await getSessionData();
  if (session?.authMethod === "atproto" && session.did) {
    try {
      const client = await getOAuthClient();
      await client.revoke(session.did as `did:${string}:${string}`);
      if (isDev) {
      }
    } catch (err) {
      console.error("[logout] AT Protocol revocation failed:", err);
    }
  }
  clearSessionCookie();
  if (isDev) {
  }
  return { ok: true };
});

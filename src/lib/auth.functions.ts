import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db";
import { users } from "../db/schema";
import { getAuthenticatedAgent } from "./auth/agent";
import { getOAuthClient } from "./auth/client";
import {
  clearSessionCookie,
  getSessionData,
  setSessionCookie,
} from "./auth/session";
import { reconcileUser } from "./sync";

const isDev = process.env.NODE_ENV === "development";

export type { SessionData } from "./auth/session";

export const getAuthState = createServerFn({ method: "GET" }).handler(async () => {
  const session = await getSessionData();
  if (!session) return null;

  const db = getDb();
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.did, session.did))
    .limit(1);

  if (!user) {
    console.error("[auth] getAuthState: session valid but user not in DB (did=%s), clearing", session.did);
    clearSessionCookie();
    return null;
  }

  return session;
});

export const initiateLogin = createServerFn({ method: "POST" })
  .inputValidator(z.object({ handle: z.string().min(1) }))
  .handler(async ({ data }) => {
    if (isDev) {
      console.debug("[login] ─── initiateLogin called ───");
      console.debug("[login] handle:", data.handle);
    }

    try {
      const client = await getOAuthClient();
      if (isDev) console.debug("[login] OAuth client obtained");
      if (isDev) console.debug("[login] calling client.authorize with handle:", data.handle);
      const url = await client.authorize(data.handle);
      if (isDev) console.debug("[login] authorize returned URL:", url.toString());
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
      console.debug("[callback] ─── handleOAuthCallback called ───");
      console.debug("[callback] params:", {
        code: data.code ? `${data.code.slice(0, 10)}...` : undefined,
        state: data.state ? `${data.state.slice(0, 10)}...` : undefined,
        iss: data.iss,
        error: data.error,
        error_description: data.error_description,
      });
    }

    if (data.error) {
      console.error("[callback] OAuth error from PDS:", data.error, data.error_description);
      throw new Error("Authentication was denied or failed. Please try again.");
    }

    try {
      const client = await getOAuthClient();
      if (isDev) console.debug("[callback] OAuth client obtained");

      const params = new URLSearchParams();
      if (data.code) params.set("code", data.code);
      if (data.state) params.set("state", data.state);
      if (data.iss) params.set("iss", data.iss);

      if (isDev)
        console.debug("[callback] calling client.callback with params:", params.toString());

      const result = await client.callback(params);
      const did = result.session.did;
      if (isDev) console.debug("[callback] session obtained, DID:", did);

      let handle: string = did;
      try {
        if (isDev) console.debug("[callback] resolving handle for DID:", did);
        const res = await fetch(`https://plc.directory/${encodeURIComponent(did)}`);
        if (res.ok) {
          const doc = (await res.json()) as { alsoKnownAs?: string[] };
          const atUri = doc.alsoKnownAs?.find((u) => u.startsWith("at://"));
          if (atUri) handle = atUri.replace("at://", "");
          if (isDev) console.debug("[callback] resolved handle:", handle);
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

      let userId: string;
      if (existing.length > 0) {
        userId = existing[0].id;
        await db.update(users).set({ handle }).where(eq(users.id, userId));
        if (isDev) console.debug("[callback] updated existing user:", userId);
      } else {
        const [newUser] = await db
          .insert(users)
          .values({ did, handle, authMethod: "atproto" })
          .returning({ id: users.id });
        userId = newUser.id;
        if (isDev) console.debug("[callback] created new user:", userId);
      }

      try {
        const agent = await getAuthenticatedAgent(did);
        await reconcileUser(agent, userId, did);
        if (isDev) console.debug("[callback] PDS reconciliation complete");
      } catch (err) {
        console.error("[callback] PDS reconciliation failed (login continues):", err);
      }

      await setSessionCookie({ did, handle });
      if (isDev) console.debug("[callback] session cookie set, login complete");
      return { did, handle };
    } catch (err) {
      console.error("[callback] failed:", err);
      throw new Error("Authentication failed. Please try again.");
    }
  });

export const logout = createServerFn({ method: "POST" }).handler(async () => {
  if (isDev) console.debug("[logout] ─── logout called ───");
  const session = await getSessionData();
  if (session) {
    try {
      const client = await getOAuthClient();
      await client.revoke(session.did as `did:${string}:${string}`);
      if (isDev) console.debug("[logout] session revoked for DID:", session.did);
    } catch (err) {
      console.error("[logout] revocation failed:", err);
    }
  }
  clearSessionCookie();
  if (isDev) console.debug("[logout] cookie cleared");
  return { ok: true };
});

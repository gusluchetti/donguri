import { createServerFn } from "@tanstack/react-start";
import {
  deleteCookie,
  getCookie,
  setCookie,
} from "@tanstack/react-start/server";
import { z } from "zod";
import { getEnv } from "./env";
import { getOAuthClient } from "./auth/client";

const isDev = process.env.NODE_ENV === "development";

// ─── Session cookie helpers ─────────────────────────────────────────────────

const COOKIE_NAME = "donguri-auth";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

type SessionData = { did: string; handle: string };

async function signPayload(payload: string): Promise<string> {
  const env = await getEnv();
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.SESSION_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return `${payload}.${sigB64}`;
}

async function verifyPayload(signed: string): Promise<string | null> {
  const lastDot = signed.lastIndexOf(".");
  if (lastDot === -1) return null;
  const payload = signed.slice(0, lastDot);
  const expected = await signPayload(payload);
  if (expected !== signed) return null;
  return payload;
}

async function setSessionCookie(data: SessionData): Promise<void> {
  const payload = btoa(JSON.stringify(data));
  const signed = await signPayload(payload);
  setCookie(COOKIE_NAME, signed, {
    httpOnly: true,
    secure: process.env.NODE_ENV !== "development",
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });
}

async function getSessionData(): Promise<SessionData | null> {
  const cookie = getCookie(COOKIE_NAME);
  if (!cookie) return null;

  const payload = await verifyPayload(cookie);
  if (!payload) return null;

  try {
    return JSON.parse(atob(payload)) as SessionData;
  } catch {
    return null;
  }
}

function clearSessionCookie(): void {
  deleteCookie(COOKIE_NAME, { path: "/" });
}

// ─── Server functions ───────────────────────────────────────────────────────

/**
 * Get current auth state from session cookie.
 */
export const getAuthState = createServerFn({ method: "GET" }).handler(
  async () => {
    return await getSessionData();
  },
);

/**
 * Initiate OAuth login — returns the authorization URL to redirect to.
 */
export const initiateLogin = createServerFn({ method: "POST" })
  .inputValidator(z.object({ handle: z.string().min(1) }))
  .handler(async ({ data }) => {
    if (isDev) {
      console.debug("[login] ─── initiateLogin called ───");
      console.debug("[login] handle:", data.handle);
    }

    let client;
    try {
      client = await getOAuthClient();
      if (isDev) console.debug("[login] OAuth client obtained");
    } catch (err) {
      console.error("[login] failed to get OAuth client:", err);
      throw err;
    }

    try {
      if (isDev) console.debug("[login] calling client.authorize with handle:", data.handle);
      const url = await client.authorize(data.handle);
      if (isDev) console.debug("[login] authorize returned URL:", url.toString());
      return { url: url.toString() };
    } catch (err) {
      console.error("[login] client.authorize failed:", err);
      if (err instanceof Error) {
        console.error("[login] error name:", err.name);
        console.error("[login] error message:", err.message);
        console.error("[login] error stack:", err.stack);
        if ("cause" in err) console.error("[login] error cause:", err.cause);
      }
      throw err;
    }
  });

/**
 * Handle OAuth callback — exchanges code for session.
 */
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
      throw new Error(data.error_description || data.error);
    }

    let client;
    try {
      client = await getOAuthClient();
      if (isDev) console.debug("[callback] OAuth client obtained");
    } catch (err) {
      console.error("[callback] failed to get OAuth client:", err);
      throw err;
    }

    const params = new URLSearchParams();
    if (data.code) params.set("code", data.code);
    if (data.state) params.set("state", data.state);
    if (data.iss) params.set("iss", data.iss);

    if (isDev) console.debug("[callback] calling client.callback with params:", params.toString());

    let session;
    try {
      const result = await client.callback(params);
      session = result.session;
      if (isDev) console.debug("[callback] session obtained, DID:", session.did);
    } catch (err) {
      console.error("[callback] client.callback failed:", err);
      if (err instanceof Error) {
        console.error("[callback] error name:", err.name);
        console.error("[callback] error message:", err.message);
        console.error("[callback] error stack:", err.stack);
      }
      throw err;
    }

    const did = session.did;

    // Resolve handle from DID via public API
    let handle = did;
    try {
      if (isDev) console.debug("[callback] resolving handle for DID:", did);
      const res = await fetch(
        `https://plc.directory/${encodeURIComponent(did)}`,
      );
      if (res.ok) {
        const doc = (await res.json()) as {
          alsoKnownAs?: string[];
        };
        const atUri = doc.alsoKnownAs?.find((u) => u.startsWith("at://"));
        if (atUri) {
          handle = atUri.replace("at://", "");
        }
        if (isDev) console.debug("[callback] resolved handle:", handle);
      } else {
        if (isDev) console.debug("[callback] PLC directory returned status:", res.status);
      }
    } catch (err) {
      console.error("[callback] handle resolution failed:", err);
      // Fall back to DID as handle
    }

    await setSessionCookie({ did, handle });
    if (isDev) console.debug("[callback] session cookie set, login complete");
    return { did, handle };
  });

/**
 * Logout — revoke AT Proto session and clear cookie.
 */
export const logout = createServerFn({ method: "POST" }).handler(async () => {
  if (isDev) console.debug("[logout] ─── logout called ───");
  const session = await getSessionData();
  if (session) {
    try {
      const client = await getOAuthClient();
      await client.revoke(session.did);
      if (isDev) console.debug("[logout] session revoked for DID:", session.did);
    } catch (err) {
      console.error("[logout] revocation failed:", err);
    }
  }
  clearSessionCookie();
  if (isDev) console.debug("[logout] cookie cleared");
  return { ok: true };
});

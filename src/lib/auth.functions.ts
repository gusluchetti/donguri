import { createServerFn } from "@tanstack/react-start";
import { deleteCookie, getCookie, setCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import { getOAuthClient } from "./auth/client";
import { getEnv } from "./env";

const isDev = process.env.NODE_ENV === "development";

// ─── Session cookie helpers ─────────────────────────────────────────────────

const COOKIE_NAME = "donguri-auth";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

type SessionData = { did: string; handle: string };

async function signPayload(payload: string): Promise<string> {
  const env = getEnv();
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.SESSION_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
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
export const getAuthState = createServerFn({ method: "GET" }).handler(async () => {
  return await getSessionData();
});

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

      // Resolve handle from DID via public API
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

      await setSessionCookie({ did, handle });
      if (isDev) console.debug("[callback] session cookie set, login complete");
      return { did, handle };
    } catch (err) {
      console.error("[callback] failed:", err);
      throw new Error("Authentication failed. Please try again.");
    }
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

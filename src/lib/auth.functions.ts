import { createServerFn } from "@tanstack/react-start";
import {
  deleteCookie,
  getCookie,
  setCookie,
} from "@tanstack/react-start/server";
import { z } from "zod";
import { getEnv } from "./env";
import { getOAuthClient } from "./auth/client";

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
    const client = await getOAuthClient();
    const url = await client.authorize(data.handle);
    return { url: url.toString() };
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
    if (data.error) {
      throw new Error(data.error_description || data.error);
    }

    const client = await getOAuthClient();
    const params = new URLSearchParams();
    if (data.code) params.set("code", data.code);
    if (data.state) params.set("state", data.state);
    if (data.iss) params.set("iss", data.iss);

    const { session } = await client.callback(params);
    const did = session.did;

    // Resolve handle from DID via public API
    let handle = did;
    try {
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
      }
    } catch {
      // Fall back to DID as handle
    }

    await setSessionCookie({ did, handle });
    return { did, handle };
  });

/**
 * Logout — revoke AT Proto session and clear cookie.
 */
export const logout = createServerFn({ method: "POST" }).handler(async () => {
  const session = await getSessionData();
  if (session) {
    try {
      const client = await getOAuthClient();
      await client.revoke(session.did);
    } catch {
      // Best-effort revocation
    }
  }
  clearSessionCookie();
  return { ok: true };
});

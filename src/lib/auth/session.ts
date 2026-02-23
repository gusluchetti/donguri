/**
 * Server-only session helpers.
 *
 * This module touches @tanstack/react-start/server (cookies) and must
 * NEVER be imported at the top level of a file that routes reach on
 * the client.  It should only be referenced inside createServerFn
 * handler bodies so TanStack Start's dead-code elimination can strip
 * the import on the client bundle.
 */
import { deleteCookie, getCookie, setCookie } from "@tanstack/react-start/server";
import { eq } from "drizzle-orm";
import { cleanEnv, getDb } from "../../db";
import { users } from "../../db/schema";

export type SessionData = {
  userId: string;
  handle: string;
  authMethod: "atproto" | "google" | "github";
  did?: string;
};

const COOKIE_NAME = "donguri-auth";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

async function signPayload(payload: string): Promise<string> {
  const secret =
    cleanEnv(process.env.SESSION_SECRET) ||
    (process.env.NODE_ENV === "production"
      ? (() => {
          throw new Error("SESSION_SECRET must be set in production");
        })()
      : crypto.randomUUID());
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
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

export async function setSessionCookie(data: SessionData): Promise<void> {
  // Encode via TextEncoder so UTF-8 names (e.g. "Luís") survive the btoa round-trip
  const payload = btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(data))));
  const signed = await signPayload(payload);
  setCookie(COOKIE_NAME, signed, {
    httpOnly: true,
    secure: process.env.NODE_ENV !== "development",
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });
}

export async function getSessionData(): Promise<SessionData | null> {
  const cookie = getCookie(COOKIE_NAME);
  if (!cookie) return null;

  const payload = await verifyPayload(cookie);
  if (!payload) return null;

  try {
    const bytes = Uint8Array.from(atob(payload), (c) => c.charCodeAt(0));
    const data = JSON.parse(new TextDecoder().decode(bytes));
    // Handle old cookie format (had `did` + `handle` but no `userId`)
    if (!data.userId) return null;
    return data as SessionData;
  } catch {
    return null;
  }
}

export function clearSessionCookie(): void {
  deleteCookie(COOKIE_NAME, { path: "/" });
}

export async function requireAuth(): Promise<SessionData> {
  const session = await getSessionData();
  if (!session) throw new Error("Not authenticated");

  // Verify the user actually exists in the DB — catches stale cookies from
  // other environments (e.g. prod session used against a fresh local DB).
  const db = getDb();
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  if (!row) {
    clearSessionCookie();
    throw new Error("SESSION_EXPIRED");
  }

  return session;
}

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
import { getDb } from "../../db";
import { users } from "../../db/schema";
import { getEnv } from "../env";

export type SessionData = { did: string; handle: string };

const COOKIE_NAME = "donguri-auth";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

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

export async function setSessionCookie(data: SessionData): Promise<void> {
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

export async function getSessionData(): Promise<SessionData | null> {
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

export function clearSessionCookie(): void {
  deleteCookie(COOKIE_NAME, { path: "/" });
}

export async function requireAuth(): Promise<SessionData & { userId: string }> {
  const session = await getSessionData();
  if (!session) throw new Error("Not authenticated");

  const db = getDb();
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.did, session.did))
    .limit(1);

  if (!user) {
    console.error(
      "[auth] session valid but user not found in DB (did=%s), clearing session",
      session.did,
    );
    clearSessionCookie();
    throw new Error("Not authenticated");
  }
  return { ...session, userId: user.id };
}

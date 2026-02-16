import { Agent } from "@atproto/api";
import { getOAuthClient } from "./client";
import { clearSessionCookie } from "./session";

/** Detect AT Protocol TokenRefreshError (session deleted/revoked on PDS). */
export function isSessionExpired(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const { name, message } = err as { name?: string; message?: string };
  return (
    name === "TokenRefreshError" ||
    (typeof message === "string" && message.includes("session was deleted"))
  );
}

export async function getAuthenticatedAgent(did: string): Promise<Agent> {
  try {
    const client = await getOAuthClient();
    const session = await client.restore(did as `did:${string}:${string}`);
    return new Agent(session);
  } catch (err) {
    if (isSessionExpired(err)) {
      console.warn("[auth] AT Protocol session expired during restore, clearing session");
      clearSessionCookie();
      throw new Error("SESSION_EXPIRED");
    }
    throw err;
  }
}

import type {
  NodeSavedSession,
  NodeSavedSessionStore,
  NodeSavedState,
  NodeSavedStateStore,
} from "@atproto/oauth-client-node";
import { eq, lt } from "drizzle-orm";
import { getDb } from "~/db";
import { oauthSessions, oauthStates } from "~/db/schema";

/**
 * Postgres-backed state store for OAuth PKCE/DPoP state during redirects.
 * Short-lived entries with TTL enforced via expiresAt column.
 */
export class PgStateStore implements NodeSavedStateStore {
  async set(key: string, value: NodeSavedState): Promise<void> {
    const db = getDb();
    const expiresAt = new Date(Date.now() + 3600 * 1000); // 1 hour TTL

    await db
      .insert(oauthStates)
      .values({ key, value: JSON.stringify(value), expiresAt })
      .onConflictDoUpdate({
        target: oauthStates.key,
        set: { value: JSON.stringify(value), expiresAt },
      });
  }

  async get(key: string): Promise<NodeSavedState | undefined> {
    const db = getDb();

    // Opportunistic cleanup of expired states
    await db.delete(oauthStates).where(lt(oauthStates.expiresAt, new Date()));

    const result = await db
      .select({ value: oauthStates.value })
      .from(oauthStates)
      .where(eq(oauthStates.key, key))
      .limit(1);

    if (result.length === 0) return undefined;
    return JSON.parse(result[0].value) as NodeSavedState;
  }

  async del(key: string): Promise<void> {
    const db = getDb();
    await db.delete(oauthStates).where(eq(oauthStates.key, key));
  }
}

/**
 * Postgres-backed session store for AT Proto tokens keyed by user DID.
 * Long-lived — sessions persist until logout or token expiry.
 */
export class PgSessionStore implements NodeSavedSessionStore {
  async set(sub: string, session: NodeSavedSession): Promise<void> {
    const db = getDb();

    await db
      .insert(oauthSessions)
      .values({ sub, session: JSON.stringify(session) })
      .onConflictDoUpdate({
        target: oauthSessions.sub,
        set: { session: JSON.stringify(session), updatedAt: new Date() },
      });
  }

  async get(sub: string): Promise<NodeSavedSession | undefined> {
    const db = getDb();

    const result = await db
      .select({ session: oauthSessions.session })
      .from(oauthSessions)
      .where(eq(oauthSessions.sub, sub))
      .limit(1);

    if (result.length === 0) return undefined;
    return JSON.parse(result[0].session) as NodeSavedSession;
  }

  async del(sub: string): Promise<void> {
    const db = getDb();
    await db.delete(oauthSessions).where(eq(oauthSessions.sub, sub));
  }
}

import type {
  NodeSavedSession,
  NodeSavedSessionStore,
  NodeSavedState,
  NodeSavedStateStore,
} from "@atproto/oauth-client-node";

/**
 * KV-backed state store for OAuth PKCE/DPoP state during redirects.
 * Short-lived entries with 1hr TTL.
 */
export class KVStateStore implements NodeSavedStateStore {
  constructor(private kv: KVNamespace) {}

  async set(key: string, value: NodeSavedState): Promise<void> {
    await this.kv.put(key, JSON.stringify(value), {
      expirationTtl: 3600,
    });
  }

  async get(key: string): Promise<NodeSavedState | undefined> {
    const raw = await this.kv.get(key);
    if (!raw) return undefined;
    return JSON.parse(raw) as NodeSavedState;
  }

  async del(key: string): Promise<void> {
    await this.kv.delete(key);
  }
}

/**
 * KV-backed session store for AT Proto tokens keyed by user DID.
 * Long-lived — sessions persist until logout or token expiry.
 */
export class KVSessionStore implements NodeSavedSessionStore {
  constructor(private kv: KVNamespace) {}

  async set(sub: string, session: NodeSavedSession): Promise<void> {
    await this.kv.put(sub, JSON.stringify(session));
  }

  async get(sub: string): Promise<NodeSavedSession | undefined> {
    const raw = await this.kv.get(sub);
    if (!raw) return undefined;
    return JSON.parse(raw) as NodeSavedSession;
  }

  async del(sub: string): Promise<void> {
    await this.kv.delete(sub);
  }
}

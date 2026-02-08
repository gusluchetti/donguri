/**
 * Environment access that works in both Cloudflare Workers (production)
 * and Node/Bun (development).
 *
 * In production: reads from CF Workers bindings via `cloudflare:workers`.
 * In development: reads secrets from .dev.vars file directly.
 * KV is shimmed with an in-memory Map.
 */

interface AppEnv {
  OAUTH_STATE: KVNamespace;
  OAUTH_SESSION: KVNamespace;
  OAUTH_PRIVATE_KEY_PEM: string;
  SESSION_SECRET: string;
}

let _env: AppEnv | null = null;

/**
 * In-memory KV shim for local development.
 * Data does not persist across restarts.
 */
class MemoryKV implements KVNamespace {
  private store = new Map<string, { value: string; expiry?: number }>();

  async get(
    key: string,
    options?: KVNamespaceGetOptions<"text">,
  ): Promise<string | null>;
  async get(key: string, type: "text"): Promise<string | null>;
  async get(key: string, type: "json"): Promise<unknown>;
  async get(key: string, type: "arrayBuffer"): Promise<ArrayBuffer | null>;
  async get(key: string, type: "stream"): Promise<ReadableStream | null>;
  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiry && Date.now() > entry.expiry) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async put(
    key: string,
    value: string,
    options?: KVNamespacePutOptions,
  ): Promise<void> {
    const expiry = options?.expirationTtl
      ? Date.now() + options.expirationTtl * 1000
      : undefined;
    this.store.set(key, { value, expiry });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async list(): Promise<KVNamespaceListResult<unknown, string>> {
    return { keys: [], list_complete: true, cacheStatus: null };
  }

  async getWithMetadata(): Promise<KVNamespaceGetWithMetadataResult<string, unknown>> {
    return { value: null, metadata: null, cacheStatus: null };
  }
}

/**
 * Parse .dev.vars (wrangler secrets file) for local development.
 * Supports multiline quoted values (PEM keys).
 */
async function loadDevVars(): Promise<Record<string, string>> {
  const { readFile } = await import("node:fs/promises");
  const { resolve } = await import("node:path");
  try {
    const content = await readFile(resolve(process.cwd(), ".dev.vars"), "utf-8");
    const vars: Record<string, string> = {};
    const regex = /^(\w+)=("([^]*?)"|(.*))/gm;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      vars[match[1]] = match[3] ?? match[4];
    }
    return vars;
  } catch {
    return {};
  }
}

export async function getEnv(): Promise<AppEnv> {
  if (_env) return _env;

  if (process.env.NODE_ENV !== "development") {
    // Production: use Cloudflare Workers bindings
    const { env } = await import("cloudflare:workers");
    _env = env as unknown as AppEnv;
    return _env;
  }

  // Development: read from .dev.vars (wrangler secrets file), shim KV with in-memory store
  const devVars = await loadDevVars();
  _env = {
    OAUTH_STATE: new MemoryKV() as unknown as KVNamespace,
    OAUTH_SESSION: new MemoryKV() as unknown as KVNamespace,
    OAUTH_PRIVATE_KEY_PEM: devVars.OAUTH_PRIVATE_KEY_PEM || "",
    SESSION_SECRET: devVars.SESSION_SECRET || "dev-secret-change-me-in-production-please",
  };
  return _env;
}

import { JoseKey } from "@atproto/jwk-jose";
import { NodeOAuthClient } from "@atproto/oauth-client-node";
import { getEnv } from "../env";
import { KVSessionStore, KVStateStore } from "./kv-stores";

const isDev = process.env.NODE_ENV === "development";

/**
 * CF Workers doesn't support `redirect: "error"` in fetch.
 * Patch to use `redirect: "manual"` and throw on redirect responses instead.
 * See: https://github.com/bluesky-social/atproto/issues/3292
 */
function patchedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  if (init?.redirect === "error") {
    return globalThis.fetch(input, { ...init, redirect: "manual" }).then(
      (res) => {
        if (res.status >= 300 && res.status < 400) {
          throw new TypeError(
            `unexpected redirect response at ${res.url} (${res.status})`,
          );
        }
        return res;
      },
    );
  }
  return globalThis.fetch(input, init);
}

/** Cached singleton — reused across requests within the same process. */
let _client: NodeOAuthClient | null = null;
let _clientUrl: string | null = null;

export async function getOAuthClient(): Promise<NodeOAuthClient> {
  const env = await getEnv();
  const publicUrl = env.PUBLIC_URL;

  // Return cached client if the URL hasn't changed (e.g. tunnel restart)
  if (_client && _clientUrl === publicUrl) {
    if (isDev) console.debug("[oauth] reusing cached client for", publicUrl);
    return _client;
  }

  if (isDev) {
    console.debug("[oauth] creating new client");
    console.debug("[oauth] PUBLIC_URL:", publicUrl);
    console.debug("[oauth] private key length:", env.OAUTH_PRIVATE_KEY.length);
  }

  if (!env.OAUTH_PRIVATE_KEY) {
    const msg = "OAUTH_PRIVATE_KEY is empty — generate keys with: bun run scripts/generate-keys.ts";
    console.error("[oauth]", msg);
    throw new Error(msg);
  }

  let keyset: JoseKey[];
  try {
    const key = await JoseKey.fromImportable(env.OAUTH_PRIVATE_KEY, "donguri-key");
    keyset = [key];
    if (isDev) console.debug("[oauth] key imported successfully, kid:", key.kid);
  } catch (err) {
    console.error("[oauth] failed to import private key:", err);
    throw new Error(`Failed to import OAuth private key: ${err instanceof Error ? err.message : err}`);
  }

  const clientMetadata = {
    client_id: `${publicUrl}/.well-known/oauth-client-metadata.json`,
    client_name: "donguri",
    client_uri: publicUrl,
    redirect_uris: [`${publicUrl}/auth/callback`] as [string],
    grant_types: ["authorization_code", "refresh_token"] as ["authorization_code", "refresh_token"],
    scope: "atproto transition:generic",
    response_types: ["code"] as ["code"],
    application_type: "web" as const,
    token_endpoint_auth_method: "private_key_jwt" as const,
    token_endpoint_auth_signing_alg: "ES256" as const,
    dpop_bound_access_tokens: true,
    jwks_uri: `${publicUrl}/.well-known/jwks.json`,
  };

  if (isDev) {
    console.debug("[oauth] client_id:", clientMetadata.client_id);
    console.debug("[oauth] redirect_uris:", clientMetadata.redirect_uris);
    console.debug("[oauth] allowHttp:", true);
  }

  _client = new NodeOAuthClient({
    clientMetadata,
    keyset,
    stateStore: new KVStateStore(env.OAUTH_STATE),
    sessionStore: new KVSessionStore(env.OAUTH_SESSION),
    allowHttp: isDev,
    fetch: patchedFetch as typeof globalThis.fetch,
  });
  _clientUrl = publicUrl;

  if (isDev) console.debug("[oauth] client created successfully");

  return _client;
}

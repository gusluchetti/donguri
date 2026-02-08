import { JoseKey } from "@atproto/jwk-jose";
import { NodeOAuthClient } from "@atproto/oauth-client-node";
import { getEnv } from "../env";
import { KVSessionStore, KVStateStore } from "./kv-stores";

const isDev = process.env.NODE_ENV === "development";
const PUBLIC_URL = isDev ? "http://127.0.0.1:3000" : "https://donguri.app";

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

export async function getOAuthClient(): Promise<NodeOAuthClient> {
  const env = await getEnv();
  const keyset = [
    await JoseKey.fromImportable(env.OAUTH_PRIVATE_KEY_PEM, "donguri-key"),
  ];

  return new NodeOAuthClient({
    clientMetadata: {
      client_id: `${PUBLIC_URL}/.well-known/oauth-client-metadata.json`,
      client_name: "donguri",
      client_uri: PUBLIC_URL,
      redirect_uris: [`${PUBLIC_URL}/auth/callback`],
      grant_types: ["authorization_code", "refresh_token"],
      scope: "atproto transition:generic",
      response_types: ["code"],
      application_type: "web",
      token_endpoint_auth_method: "private_key_jwt",
      token_endpoint_auth_signing_alg: "ES256",
      dpop_bound_access_tokens: true,
      jwks_uri: `${PUBLIC_URL}/.well-known/jwks.json`,
    },
    keyset,
    stateStore: new KVStateStore(env.OAUTH_STATE),
    sessionStore: new KVSessionStore(env.OAUTH_SESSION),
    allowHttp: isDev,
    fetch: patchedFetch as typeof globalThis.fetch,
  });
}

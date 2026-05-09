import { JoseKey } from "@atproto/jwk-jose";
import { NodeOAuthClient, requestLocalLock } from "@atproto/oauth-client-node";
import { cleanEnv, getPublicUrl } from "~/lib/env";
import { log } from "~/lib/logger";
import { PgSessionStore, PgStateStore } from "./auth.kv-stores";

/** Cached singleton — reused across requests within the same process. */
let _client: NodeOAuthClient | null = null;
let _clientUrl: string | null = null;

export async function getOAuthClient(): Promise<NodeOAuthClient> {
  const publicUrl = getPublicUrl();
  const privateKeyJwk = cleanEnv(process.env.OAUTH_PRIVATE_KEY_JWK);

  // Return cached client if the URL hasn't changed (e.g. tunnel restart)
  if (_client && _clientUrl === publicUrl) {
    log.debug("[oauth] returning cached client");
    return _client;
  }

  log.debug("[oauth] creating new OAuth client for URL:", publicUrl);

  if (!privateKeyJwk) {
    const msg = "OAUTH_PRIVATE_KEY is empty — set OAUTH_PRIVATE_KEY_JWK in .env (see .env.example)";
    console.error("[oauth]", msg);
    throw new Error(msg);
  }

  let keyset: JoseKey[];
  try {
    const key = await JoseKey.fromImportable(privateKeyJwk, "donguri-key");
    keyset = [key];
    log.debug("[oauth] imported private key");
  } catch (err) {
    console.error("[oauth] failed to import private key:", err);
    throw new Error(
      `Failed to import OAuth private key: ${err instanceof Error ? err.message : err}`,
    );
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

  log.debug("[oauth] client metadata built");

  _client = new NodeOAuthClient({
    clientMetadata,
    keyset,
    stateStore: new PgStateStore(),
    sessionStore: new PgSessionStore(),
    requestLock: requestLocalLock,
    allowHttp: process.env.NODE_ENV === "development",
  });

  log.debug("[oauth] OAuth client created successfully");

  return _client;
}

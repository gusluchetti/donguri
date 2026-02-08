import { JoseKey } from "@atproto/jwk-jose";
import {
  createStartHandler,
  defaultStreamHandler,
} from "@tanstack/react-start/server";
import { getEnv } from "./lib/env";

const isDev = process.env.NODE_ENV === "development";
const PUBLIC_URL = isDev ? "http://127.0.0.1:3000" : "https://donguri.app";

const startHandler = createStartHandler(defaultStreamHandler);

const fetch = async (request: Request, ...args: unknown[]) => {
  const url = new URL(request.url);

  if (url.pathname === "/.well-known/oauth-client-metadata.json") {
    return Response.json(
      {
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
      {
        headers: { "Cache-Control": "public, max-age=3600" },
      },
    );
  }

  if (url.pathname === "/.well-known/jwks.json") {
    const env = await getEnv();
    const key = await JoseKey.fromImportable(
      env.OAUTH_PRIVATE_KEY_PEM,
      "donguri-key",
    );
    return Response.json(
      { keys: [key.publicJwk] },
      {
        headers: { "Cache-Control": "public, max-age=3600" },
      },
    );
  }

  return startHandler(request, ...args);
};

export default { fetch };

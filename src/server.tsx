import { JoseKey } from "@atproto/jwk-jose";
import { createStartHandler, defaultStreamHandler } from "@tanstack/react-start/server";
import { getEnv } from "./lib/env";

const startHandler = createStartHandler(defaultStreamHandler);

const fetch = async (request: Request) => {
  const url = new URL(request.url);

  if (url.pathname === "/.well-known/oauth-client-metadata.json") {
    const env = getEnv();
    const publicUrl = env.PUBLIC_URL;
    return Response.json(
      {
        client_id: `${publicUrl}/.well-known/oauth-client-metadata.json`,
        client_name: "donguri",
        client_uri: publicUrl,
        redirect_uris: [`${publicUrl}/auth/callback`],
        grant_types: ["authorization_code", "refresh_token"],
        scope: "atproto transition:generic",
        response_types: ["code"],
        application_type: "web",
        token_endpoint_auth_method: "private_key_jwt",
        token_endpoint_auth_signing_alg: "ES256",
        dpop_bound_access_tokens: true,
        jwks_uri: `${publicUrl}/.well-known/jwks.json`,
      },
      {
        headers: { "Cache-Control": "public, max-age=3600" },
      },
    );
  }

  if (url.pathname === "/api/health") {
    return Response.json({ status: "ok", timestamp: new Date().toISOString() });
  }

  // 301 redirect old /media/ paths to /catalog/
  if (url.pathname.startsWith("/media/")) {
    const newPath = url.pathname.replace(/^\/media\//, "/catalog/");
    return new Response(null, {
      status: 301,
      headers: { Location: `${newPath}${url.search}` },
    });
  }

  if (url.pathname === "/.well-known/jwks.json") {
    try {
      const env = getEnv();
      const key = await JoseKey.fromImportable(env.OAUTH_PRIVATE_KEY_JWK, "donguri-key");
      return Response.json(
        { keys: [key.publicJwk] },
        {
          headers: { "Cache-Control": "public, max-age=3600" },
        },
      );
    } catch {
      return Response.json({ error: "JWKS not configured" }, { status: 500 });
    }
  }

  return startHandler(request);
};

export default { fetch };

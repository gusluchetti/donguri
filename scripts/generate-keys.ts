/**
 * Generate an ES256 key pair for AT Protocol OAuth.
 * Run: bun run scripts/generate-keys.ts
 *
 * Copy the OAUTH_PRIVATE_KEY_JWK line into your .dev.vars file.
 */

import { exportJWK, generateKeyPair } from "jose";

const { privateKey } = await generateKeyPair("ES256", { extractable: true });
const jwk = await exportJWK(privateKey);
jwk.alg = "ES256";

const jwkStr = JSON.stringify(jwk);

console.log("=== .dev.vars snippet (copy this line) ===\n");
console.log(`OAUTH_PRIVATE_KEY_JWK=${jwkStr}`);
console.log(`SESSION_SECRET="${crypto.randomUUID()}"`);
console.log();
console.log("=== Public JWK (for reference) ===\n");
const { d: _d, ...publicJwk } = jwk;
console.log(JSON.stringify(publicJwk, null, 2));

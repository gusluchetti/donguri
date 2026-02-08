declare module "cloudflare:workers" {
  interface Env {
    OAUTH_STATE: KVNamespace;
    OAUTH_SESSION: KVNamespace;
    OAUTH_PRIVATE_KEY_PEM: string;
    SESSION_SECRET: string;
  }
  export const env: Env;
}

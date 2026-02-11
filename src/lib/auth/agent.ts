import { Agent } from "@atproto/api";
import { getOAuthClient } from "./client";

export async function getAuthenticatedAgent(did: string): Promise<Agent> {
  const client = await getOAuthClient();
  const session = await client.restore(did as `did:${string}:${string}`);
  return new Agent(session);
}

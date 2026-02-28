import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { handleOAuthProviderCallback } from "~/features/auth/auth.functions";
import { AuthCallbackError } from "~/features/auth/components/oauth-callback";

export const Route = createFileRoute("/auth/github/callback")({
  validateSearch: z.object({
    code: z.string().optional(),
    error: z.string().optional(),
  }),
  beforeLoad: async ({ search }) => {
    if (search.error) throw new Error("Authentication was denied or failed.");
    if (!search.code) throw new Error("Missing authorization code.");

    try {
      await handleOAuthProviderCallback({ data: { provider: "github", code: search.code } });
    } catch {
      throw new Error("Authentication failed. Please try again.");
    }
    throw redirect({ to: "/" });
  },
  errorComponent: AuthCallbackError,
});

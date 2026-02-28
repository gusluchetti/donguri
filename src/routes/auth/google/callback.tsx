import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { handleOAuthProviderCallback } from "~/features/auth/auth.functions";
import { AuthCallbackError } from "~/features/auth/components/oauth-callback";

export const Route = createFileRoute("/auth/google/callback")({
  validateSearch: z.object({
    code: z.string().optional(),
    error: z.string().optional(),
  }),
  beforeLoad: async ({ search, context }) => {
    if (search.error) throw new Error("Authentication was denied or failed.");
    if (!search.code) throw new Error("Missing authorization code.");

    try {
      await handleOAuthProviderCallback({ data: { provider: "google", code: search.code } });
    } catch {
      throw new Error("Authentication failed. Please try again.");
    }
    context.queryClient.removeQueries({ queryKey: ["auth"] });
    throw redirect({ to: "/" });
  },
  errorComponent: AuthCallbackError,
});

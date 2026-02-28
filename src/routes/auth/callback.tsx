import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { handleOAuthCallback } from "~/features/auth/auth.functions";
import { AuthCallbackError } from "~/features/auth/components/oauth-callback";

export const Route = createFileRoute("/auth/callback")({
  validateSearch: z.object({
    code: z.string().optional(),
    state: z.string().optional(),
    iss: z.string().optional(),
    error: z.string().optional(),
    error_description: z.string().optional(),
  }),
  beforeLoad: async ({ search, context }) => {
    if (search.error) throw new Error("Authentication was denied or failed.");

    try {
      await handleOAuthCallback({ data: search });
    } catch {
      throw new Error("Authentication failed. Please try again.");
    }
    context.queryClient.removeQueries({ queryKey: ["auth"] });
    throw redirect({ to: "/" });
  },
  errorComponent: AuthCallbackError,
});

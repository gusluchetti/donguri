import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { OAuthProviderCallback } from "../../../lib/oauth-callback";

export const Route = createFileRoute("/auth/google/callback")({
  validateSearch: z.object({
    code: z.string().optional(),
    error: z.string().optional(),
  }),
  component: () => {
    const { code, error } = Route.useSearch();
    return (
      <OAuthProviderCallback provider="google" code={code} searchError={error} label="Google" />
    );
  },
});

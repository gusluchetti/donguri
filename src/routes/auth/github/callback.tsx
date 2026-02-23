import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { OAuthProviderCallback } from "~/features/auth/components/oauth-callback";

export const Route = createFileRoute("/auth/github/callback")({
  validateSearch: z.object({
    code: z.string().optional(),
    error: z.string().optional(),
  }),
  component: () => {
    const { code, error } = Route.useSearch();
    return (
      <OAuthProviderCallback provider="github" code={code} searchError={error} label="GitHub" />
    );
  },
});

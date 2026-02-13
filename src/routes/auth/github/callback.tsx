import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { handleOAuthProviderCallback } from "../../../lib/auth.functions";

export const Route = createFileRoute("/auth/github/callback")({
  validateSearch: z.object({
    code: z.string().optional(),
    error: z.string().optional(),
  }),
  component: GitHubCallbackPage,
});

function GitHubCallbackPage() {
  const { code, error: searchError } = Route.useSearch();
  const [error, setError] = useState<string | null>(
    searchError ? "Authentication was denied or failed." : null,
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once on mount
  useEffect(() => {
    if (searchError || !code) {
      if (!searchError) setError("Missing authorization code.");
      return;
    }

    handleOAuthProviderCallback({ data: { provider: "github", code } })
      .then(() => {
        window.location.href = "/";
      })
      .catch(() => {
        setError("Authentication failed. Please try again.");
      });
  }, []);

  return (
    <div className="bg-dg-bg text-dg-text min-h-screen font-mono">
      <div className="max-w-[600px] mx-auto px-6 py-16">
        {error ? (
          <div className="border border-dg-movie/30 rounded p-5 bg-dg-surface">
            <p className="text-dg-movie text-[0.8rem] uppercase tracking-wider mb-3">
              Authentication error
            </p>
            <p className="text-dg-text-secondary text-[0.85rem] leading-relaxed mb-4">{error}</p>
            <a href="/" className="text-[0.85rem] text-dg-accent no-underline">
              Back to home
            </a>
          </div>
        ) : (
          <p className="text-dg-text-secondary text-[0.85rem]">
            <span className="dg-ellipsis">Signing in with GitHub</span>
          </p>
        )}
      </div>
    </div>
  );
}

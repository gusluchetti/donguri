import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { handleOAuthCallback } from "~/lib/auth.functions";

export const Route = createFileRoute("/auth/callback")({
  validateSearch: z.object({
    code: z.string().optional(),
    state: z.string().optional(),
    iss: z.string().optional(),
    error: z.string().optional(),
    error_description: z.string().optional(),
  }),
  component: CallbackPage,
});

function CallbackPage() {
  const search = Route.useSearch();
  const [error, setError] = useState<string | null>(
    search.error ? "Authentication was denied or failed." : null,
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once on mount with initial search params
  useEffect(() => {
    if (search.error) return;

    handleOAuthCallback({ data: search })
      .then(() => {
        window.location.href = "/";
      })
      .catch(() => {
        setError("Authentication failed. Please try again.");
      });
  }, []);

  return (
    <div className="bg-dg-bg text-dg-text flex-1 overflow-y-auto font-mono">
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
            <span className="dg-ellipsis">Authenticating</span>
          </p>
        )}
      </div>
    </div>
  );
}

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { handleOAuthCallback } from "../../lib/auth.functions";

export const Route = createFileRoute("/auth/callback")({
  validateSearch: (search: Record<string, unknown>) => ({
    code: search.code as string | undefined,
    state: search.state as string | undefined,
    iss: search.iss as string | undefined,
    error: search.error as string | undefined,
    error_description: search.error_description as string | undefined,
  }),
  component: CallbackPage,
});

function CallbackPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(
    search.error ? "Authentication was denied or failed." : null,
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once on mount with initial search params
  useEffect(() => {
    if (search.error) return;

    handleOAuthCallback({ data: search })
      .then(() => {
        navigate({ to: "/" });
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
          <div className="flex items-center gap-3">
            <div className="w-4 h-4 border-2 border-dg-accent border-t-transparent rounded-full animate-spin" />
            <p className="text-dg-text-secondary text-[0.85rem]">Authenticating...</p>
          </div>
        )}
      </div>
    </div>
  );
}

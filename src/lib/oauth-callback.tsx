import { useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { handleOAuthProviderCallback } from "./auth.functions";

export function OAuthProviderCallback({
  provider,
  code,
  searchError,
  label,
}: {
  provider: string;
  code?: string;
  searchError?: string;
  label: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(
    searchError ? "Authentication was denied or failed." : null,
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once on mount
  useEffect(() => {
    if (searchError || !code) {
      if (!searchError) setError("Missing authorization code.");
      return;
    }

    handleOAuthProviderCallback({ data: { provider, code } })
      .then(async () => {
        await router.invalidate();
        router.navigate({ to: "/" });
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
            <span className="dg-ellipsis">Signing in with {label}</span>
          </p>
        )}
      </div>
    </div>
  );
}

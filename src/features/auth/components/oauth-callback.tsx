import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { handleOAuthProviderCallback } from "~/features/auth/auth.functions";
import { AcornIcon } from "~/features/media/components/AcornIcon";

export function OAuthProviderCallback({
  provider,
  code,
  searchError,
  label,
}: {
  provider: "google" | "github";
  code?: string;
  searchError?: string;
  label: string;
}) {
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
      .then(() => {
        window.location.href = "/";
      })
      .catch(() => {
        setError("Authentication failed. Please try again.");
      });
  }, []);

  return (
    <div className="text-dg-text flex-1 overflow-y-auto font-body flex items-center justify-center">
      <div className="w-full max-w-[400px] mx-auto px-g3 py-12 sm:py-16">
        <div className="flex flex-col items-center mb-8">
          <Link to="/" className="flex flex-col items-center gap-2 no-underline">
            <span className="text-dg-accent">
              <AcornIcon size={36} />
            </span>
            <span className="font-display text-[1.5rem] text-dg-text">donguri</span>
          </Link>
        </div>

        {error ? (
          <div className="border border-dg-movie/30 rounded p-5 bg-dg-surface">
            <p className="text-dg-movie text-[0.8rem] uppercase tracking-wider mb-3">
              Authentication error
            </p>
            <p className="text-dg-text-secondary text-[0.85rem] leading-relaxed mb-4">{error}</p>
            <div className="flex items-center gap-4">
              <Link to="/login" className="text-[0.85rem] text-dg-accent no-underline">
                Try again
              </Link>
              <Link
                to="/"
                className="text-[0.85rem] text-dg-text-tertiary no-underline hover:text-dg-text-secondary transition-colors"
              >
                Back to home
              </Link>
            </div>
          </div>
        ) : (
          <div className="text-center">
            <p className="text-dg-text-secondary text-[0.85rem]">
              <span className="dg-ellipsis">Signing in with {label}</span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

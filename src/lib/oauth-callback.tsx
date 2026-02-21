import { useEffect, useState } from "react";
import { handleOAuthProviderCallback } from "./auth.functions";
import styles from "./oauth-callback.module.css";

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
  const [error, setError] = useState<string | null>(
    searchError ? "Authentication was denied or failed." : null,
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once on mount
  useEffect(() => {
    if (searchError || !code) {
      if (!searchError) setError("Missing authorization code.");
      return;
    }

    handleOAuthProviderCallback({ data: { provider: provider as "google" | "github", code } })
      .then(() => {
        window.location.href = "/";
      })
      .catch(() => {
        setError("Authentication failed. Please try again.");
      });
  }, []);

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        {error ? (
          <div className={styles.errorCard}>
            <p className={styles.errorTitle}>Authentication error</p>
            <p className={styles.errorMsg}>{error}</p>
            <a href="/" className={styles.backLink}>
              Back to home
            </a>
          </div>
        ) : (
          <p className={styles.loading}>
            <span className="dg-ellipsis">Signing in with {label}</span>
          </p>
        )}
      </div>
    </div>
  );
}

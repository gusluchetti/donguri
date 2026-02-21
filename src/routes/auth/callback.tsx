import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { handleOAuthCallback } from "../../lib/auth.functions";
import styles from "./callback.module.css";

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
            <span className="dg-ellipsis">Authenticating</span>
          </p>
        )}
      </div>
    </div>
  );
}

import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { SoundEngine } from "~/features/catalog/catalog.sound";

export function AuthBanner({ initialDismissed = false }: { initialDismissed?: boolean }) {
  const [dismissed, setDismissed] = useState(initialDismissed);

  if (dismissed) return null;

  const handleDismiss = () => {
    SoundEngine.click();
    // biome-ignore lint/suspicious/noDocumentCookie: Cookie Store API lacks Firefox/Safari support
    document.cookie = "dg-banner-dismissed=1;path=/;max-age=34560000;samesite=lax";
    setDismissed(true);
  };

  return (
    <div
      className="font-body shrink-0"
      style={{
        background: "var(--color-dg-accent-soft)",
        borderBottom: "1px solid color-mix(in srgb, var(--color-dg-accent) 20%, transparent)",
      }}
    >
      <div className="max-w-[1100px] mx-auto px-3 sm:px-g3 flex items-center justify-between h-10 sm:h-10 min-h-[44px] sm:min-h-0">
        <p className="text-[0.8rem] text-dg-text-secondary m-0">
          Track all your media in one place.{" "}
          <Link
            to="/login"
            className="text-dg-accent no-underline font-medium hover:underline"
            onClick={() => SoundEngine.click()}
          >
            Sign in
          </Link>{" "}
          to get started.
        </p>
        <button
          type="button"
          onClick={handleDismiss}
          className="bg-transparent border-none text-dg-text-tertiary hover:text-dg-text-secondary cursor-pointer p-1 text-base leading-none transition-colors"
          aria-label="Dismiss banner"
        >
          ×
        </button>
      </div>
    </div>
  );
}

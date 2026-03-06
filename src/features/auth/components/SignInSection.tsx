import { GithubLogo, GoogleLogo } from "@phosphor-icons/react";
import { useState } from "react";
import { Button } from "~/components/Button";
import { initiateLogin, initiateOAuthLogin } from "~/features/auth/auth.functions";

export function SignInSection() {
  return (
    <div className="flex flex-col gap-3">
      <div className="text-[0.8rem] text-dg-text-secondary uppercase tracking-wider">Sign in</div>

      <BlueskyLoginForm />

      <div className="flex items-center gap-3">
        <div className="flex-1 border-t border-dg-border-subtle" />
        <span className="text-[0.75rem] text-dg-text-tertiary">or</span>
        <div className="flex-1 border-t border-dg-border-subtle" />
      </div>

      <div className="flex flex-col gap-2">
        <OAuthButton
          provider="google"
          label="Continue with Google"
          icon={<GoogleLogo size={16} weight="bold" />}
        />
        <OAuthButton
          provider="github"
          label="Continue with GitHub"
          icon={<GithubLogo size={16} weight="bold" />}
        />
      </div>
    </div>
  );
}

function BlueskyLoginForm() {
  const [handle, setHandle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!handle.trim()) return;

    setLoading(true);
    setError(null);

    const trimmed = handle.trim();

    try {
      const result = await initiateLogin({ data: { handle: trimmed } });
      window.location.href = result.url;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to initiate login";
      setError(msg);
      setLoading(false);
    }
  };

  return (
    <div className="border border-dg-border-subtle rounded p-4 sm:p-5 bg-dg-surface">
      <form onSubmit={onSubmit}>
        <label
          htmlFor="handle"
          className="flex items-center gap-2 text-dg-text-secondary text-[0.8rem] uppercase tracking-wider mb-3"
        >
          <a
            href="https://atproto.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-inherit no-underline hover:text-dg-accent transition-colors duration-50"
          >
            AT Protocol
          </a>
          <span className="normal-case tracking-normal text-[0.65rem] text-dg-accent border border-dg-accent/30 rounded-sm px-1.5 py-px font-semibold">
            recommended
          </span>
        </label>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            id="handle"
            type="text"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="handle.bsky.social"
            disabled={loading}
            className="flex-1 bg-dg-bg border border-dg-border rounded-sm px-3 py-2.5 sm:py-2 text-base sm:text-[0.85rem] text-dg-text font-mono placeholder:text-dg-text-tertiary focus:outline-none focus:border-dg-accent disabled:opacity-50"
          />
          <Button
            type="submit"
            variant="accent"
            disabled={loading || !handle.trim()}
            className="py-2.5 sm:py-2"
          >
            {loading ? <span className="dg-ellipsis">Signing in</span> : "Sign in"}
          </Button>
        </div>
        {error && <p className="text-dg-movie text-[0.8rem] mt-2">{error}</p>}
      </form>
      <p className="text-[0.75rem] text-dg-text-tertiary mt-3">
        Sign in with your Bluesky handle or any AT Protocol identity. Your catalog data syncs to
        your own data server — portable and private.
      </p>
    </div>
  );
}

function OAuthButton({
  provider,
  label,
  icon,
}: {
  provider: "google" | "github";
  label: string;
  icon?: React.ReactNode;
}) {
  const [loading, setLoading] = useState(false);

  const onClick = async () => {
    setLoading(true);
    try {
      const result = await initiateOAuthLogin({ data: { provider } });
      window.location.href = result.url;
    } catch {
      setLoading(false);
    }
  };

  return (
    <Button
      variant="secondary"
      onClick={onClick}
      disabled={loading}
      className="w-full py-2.5 sm:py-2"
    >
      {loading ? (
        <span className="dg-ellipsis">Redirecting</span>
      ) : (
        <>
          {icon}
          {label}
        </>
      )}
    </Button>
  );
}

import { createFileRoute, getRouteApi, Link } from "@tanstack/react-router";
import { useState } from "react";
import { initiateLogin } from "../lib/auth.functions";

const rootRoute = getRouteApi("__root__");

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  const { auth } = rootRoute.useLoaderData();

  return (
    <div className="bg-dg-bg text-dg-text min-h-screen font-mono">
      <div className="max-w-[600px] mx-auto px-6 py-16">
        <h1 className="text-[2rem] font-semibold -tracking-[0.02em] mb-2">
          <span className="text-dg-accent">donguri</span>
        </h1>
        <p className="text-dg-text-secondary text-[0.9rem] leading-relaxed mb-8">
          Track movies, TV, anime, and games. Your watchlist, your data, your rules.
        </p>

        {auth ? <LoggedInView handle={auth.handle} /> : <LoginForm />}

        <div className="flex gap-3 mt-8">
          <Link
            to="/catalog"
            className="text-[0.85rem] text-dg-accent no-underline py-2 px-4 border border-dg-accent/20 rounded-sm transition-all duration-150"
          >
            Browse catalog
          </Link>
          <Link
            to="/roadmap"
            className="text-[0.85rem] text-dg-text-secondary no-underline py-2 px-4 border border-dg-border-subtle rounded-sm transition-all duration-150"
          >
            Roadmap
          </Link>
        </div>
      </div>
    </div>
  );
}

function LoggedInView({ handle }: { handle: string }) {
  return (
    <div className="border border-dg-border-subtle rounded p-5 bg-dg-surface">
      <p className="text-dg-text text-[0.9rem] mb-2">
        Signed in as <span className="text-dg-accent">@{handle}</span>
      </p>
      <p className="text-dg-text-secondary text-[0.85rem] leading-relaxed">
        Watchlist features are coming soon. For now, browse the catalog.
      </p>
    </div>
  );
}

function LoginForm() {
  const [handle, setHandle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!handle.trim()) return;

    setLoading(true);
    setError(null);

    const trimmed = handle.trim();
    console.debug("[login-ui] submitting handle:", trimmed);

    try {
      console.debug("[login-ui] calling initiateLogin...");
      const result = await initiateLogin({ data: { handle: trimmed } });
      console.debug("[login-ui] got redirect URL:", result.url);
      window.location.href = result.url;
    } catch (err) {
      console.error("[login-ui] initiateLogin failed:", err);
      const msg = err instanceof Error ? err.message : "Failed to initiate login";
      console.error("[login-ui] error message shown to user:", msg);
      setError(msg);
      setLoading(false);
    }
  };

  return (
    <div className="border border-dg-border-subtle rounded p-5 bg-dg-surface">
      <form onSubmit={onSubmit}>
        <label
          htmlFor="handle"
          className="block text-dg-text-secondary text-[0.8rem] uppercase tracking-wider mb-3"
        >
          Sign in with Bluesky
        </label>
        <div className="flex gap-2">
          <input
            id="handle"
            type="text"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="handle.bsky.social"
            disabled={loading}
            className="flex-1 bg-dg-bg border border-dg-border rounded px-3 py-2 text-[0.85rem] text-dg-text font-mono placeholder:text-dg-text-tertiary focus:outline-none focus:border-dg-accent/50 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={loading || !handle.trim()}
            className="bg-transparent border border-dg-accent/30 text-dg-accent px-4 py-2 rounded-sm text-[0.85rem] font-mono cursor-pointer transition-all duration-150 hover:border-dg-accent/60 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? "..." : "Sign in"}
          </button>
        </div>
        {error && <p className="text-dg-movie text-[0.8rem] mt-2">{error}</p>}
      </form>
    </div>
  );
}

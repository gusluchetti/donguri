import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  return (
    <div className="bg-dg-bg text-dg-text min-h-screen font-mono">
      <div className="max-w-[600px] mx-auto px-6 py-16">
        <h1 className="text-[2rem] font-semibold -tracking-[0.02em] mb-2">
          <span className="text-dg-accent">donguri</span>
        </h1>
        <p className="text-dg-text-secondary text-[0.9rem] leading-relaxed mb-8">
          Track movies, TV, anime, and games across the ATmosphere.
          Your watchlist, your data, stored on your own AT Protocol PDS.
        </p>

        <div className="border border-dg-border-subtle rounded p-5 mb-8 bg-dg-surface">
          <p className="text-dg-text-tertiary text-[0.8rem] uppercase tracking-wider mb-3">
            Coming soon
          </p>
          <p className="text-dg-text-secondary text-[0.85rem] leading-relaxed">
            Sign in with your AT Protocol identity to start tracking.
            Your watchlist, ratings, and progress will live on your PDS —
            portable, yours, and interoperable with the ATmosphere.
          </p>
        </div>

        <div className="flex gap-3">
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

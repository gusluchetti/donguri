import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { trackedIdsOptions, watchlistOptions } from "~/features/catalog/catalog.queries";
import { homepageSampleOptions } from "~/features/media/media.queries";
import { OnboardingFlow } from "~/features/onboarding/OnboardingFlow";
import { onboardingPicksOptions } from "~/features/onboarding/onboarding.queries";
import { ogTags, pageTitle } from "~/lib/og";
import { type CatalogEntryRow, LoggedInView } from "./-logged-in";
import { LoggedOutView } from "./-logged-out";

const rootRoute = getRouteApi("__root__");

export const Route = createFileRoute("/")({
  loader: async ({ context }) => {
    const trackedIds = await context.queryClient
      .ensureQueryData(trackedIdsOptions())
      .catch(() => null);
    const isLoggedIn = !!trackedIds;
    await context.queryClient.prefetchQuery(homepageSampleOptions());
    const entries = isLoggedIn
      ? await context.queryClient
          .fetchQuery(watchlistOptions())
          .catch(() => [] as CatalogEntryRow[])
      : [];

    // Prefetch onboarding picks when logged in but collection is empty
    if (isLoggedIn && entries.length === 0) {
      context.queryClient.prefetchQuery(onboardingPicksOptions());
    }

    return { entries };
  },
  staleTime: 5 * 60 * 1000,
  head: () => ({
    meta: [
      { title: pageTitle("donguri") },
      ...ogTags({
        title: "donguri — track movies, TV, anime, and games",
        description:
          "Your personal catalog for movies, TV shows, anime, and games. Track what you've watched, rate titles, and keep your watchlist organized.",
        path: "/",
      }),
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const { auth } = rootRoute.useLoaderData();
  const { entries } = Route.useLoaderData();

  if (!auth) {
    return <LoggedOutView />;
  }

  if (entries.length === 0) {
    return <OnboardingFlow />;
  }

  return (
    <div className="dg-page-enter text-dg-text flex-1 overflow-y-auto font-body">
      <div className="max-w-[1100px] mx-auto px-g3 py-4 sm:py-6">
        <LoggedInView entries={entries} />
      </div>
    </div>
  );
}

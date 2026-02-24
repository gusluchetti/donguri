import { Star } from "@phosphor-icons/react";
import { createFileRoute, getRouteApi, Link } from "@tanstack/react-router";
import { watchlistOptions } from "~/features/catalog/catalog.queries";
import { SoundEngine } from "~/features/catalog/catalog.sound";
import { CoverThumb } from "~/features/catalog/components/CoverThumb";
import { StampBadge } from "~/features/catalog/components/StampBadge";
import { SectionHeader } from "~/features/media/components/SectionHeader";
import {
  displayMediaType,
  ratingColor,
  STATUS_LABELS_GENERIC,
  type StatusValue,
} from "~/features/media/media-types";
import { ogTags, pageTitle } from "~/lib/og";

const rootRoute = getRouteApi("__root__");

type CatalogEntryRow = {
  id: string;
  mediaWikidataId: string;
  status: string | null;
  rating: number | null;
  note: string | null;
  episodeProgress: number | null;
  isFavorite: boolean;
  replayCount: number;
  updatedAt: Date | null;
  mediaTitle: string | null;
  mediaType: string | null;
  animationOrigin: string | null;
  watchedEpisodes: Record<string, Record<string, string>> | null;
  episodeCount: number | null;
  seasonCount: number | null;
  posterUrl: string | null;
};

export const Route = createFileRoute("/profile")({
  loader: async ({ context }) => {
    const entries = await context.queryClient
      .fetchQuery(watchlistOptions())
      .catch(() => [] as CatalogEntryRow[]);
    return { entries };
  },
  staleTime: 5 * 60 * 1000,
  head: () => ({
    meta: [
      { title: pageTitle("profile — donguri") },
      ...ogTags({
        title: "profile — donguri",
        description: "Your donguri profile — activity, favorites, and achievements.",
        path: "/profile",
      }),
    ],
  }),
  component: ProfilePage,
});

// ─── Stamp Definitions (placeholder achievements) ────────────────────────────

type Stamp = {
  id: string;
  label: string;
  icon: string;
  description: string;
  color: string;
};

const STAMPS: Stamp[] = [
  {
    id: "first-track",
    label: "First Track",
    icon: "\u{1F331}",
    description: "Track your first title",
    color: "var(--color-dg-stamped)",
  },
  {
    id: "critic",
    label: "Critic",
    icon: "\u{1F58B}",
    description: "Rate 10 titles",
    color: "var(--color-dg-accent)",
  },
  {
    id: "film-buff",
    label: "Film Buff",
    icon: "\u{1F3AC}",
    description: "Complete 25 movies",
    color: "var(--color-dg-movie)",
  },
  {
    id: "binge",
    label: "Binge",
    icon: "\u{1F4FA}",
    description: "Complete 10 TV series",
    color: "var(--color-dg-tv)",
  },
  {
    id: "otaku",
    label: "Otaku",
    icon: "\u{2728}",
    description: "Complete 25 anime",
    color: "var(--color-dg-anime)",
  },
  {
    id: "player-one",
    label: "Player One",
    icon: "\u{1F3AE}",
    description: "Complete 10 games",
    color: "var(--color-dg-game)",
  },
  {
    id: "centurion",
    label: "Centurion",
    icon: "\u{1F3C6}",
    description: "Track 100 titles",
    color: "var(--color-dg-sealed)",
  },
  {
    id: "perfectionist",
    label: "Perfectionist",
    icon: "\u{2726}",
    description: "Master 5 titles",
    color: "var(--color-dg-sealed)",
  },
];

/** Check if a stamp is earned based on current entries. */
function isStampEarned(stamp: Stamp, entries: CatalogEntryRow[]): boolean {
  switch (stamp.id) {
    case "first-track":
      return entries.length >= 1;
    case "critic":
      return entries.filter((e) => e.rating != null).length >= 10;
    case "film-buff":
      return (
        entries.filter(
          (e) => e.status === "completed" && e.mediaType === "movie" && !e.animationOrigin,
        ).length >= 25
      );
    case "binge":
      return (
        entries.filter(
          (e) => e.status === "completed" && e.mediaType === "tv_series" && !e.animationOrigin,
        ).length >= 10
      );
    case "otaku":
      return (
        entries.filter((e) => e.status === "completed" && e.animationOrigin === "anime").length >=
        25
      );
    case "player-one":
      return entries.filter((e) => e.status === "completed" && e.mediaType === "game").length >= 10;
    case "centurion":
      return entries.length >= 100;
    case "perfectionist":
      return entries.filter((e) => e.status === "mastered").length >= 5;
    default:
      return false;
  }
}

// ─── Stats ───────────────────────────────────────────────────────────────────

function computeStats(entries: CatalogEntryRow[]) {
  const total = entries.length;
  const rated = entries.filter((e) => e.rating != null).length;
  const completed = entries.filter(
    (e) => e.status === "completed" || e.status === "mastered",
  ).length;
  const favorites = entries.filter((e) => e.isFavorite).length;

  const ratings = entries.reduce<number[]>((acc, e) => {
    if (e.rating != null) acc.push(e.rating);
    return acc;
  }, []);
  const avgRating =
    ratings.length > 0 ? Math.round(ratings.reduce((a, b) => a + b, 0) / ratings.length) : null;

  const byStatus = new Map<string, number>();
  for (const e of entries) {
    if (e.status) byStatus.set(e.status, (byStatus.get(e.status) ?? 0) + 1);
  }

  return { total, rated, completed, favorites, avgRating, byStatus };
}

// ─── Page ────────────────────────────────────────────────────────────────────

function ProfilePage() {
  const { auth } = rootRoute.useLoaderData();

  if (!auth) {
    return (
      <div className="dg-page-enter text-dg-text flex-1 overflow-y-auto font-body flex items-center justify-center">
        <div className="text-center px-4 py-16">
          <p className="font-display text-[2rem] font-normal text-dg-accent mb-2">profile</p>
          <p className="text-[0.9rem] text-dg-text-secondary mb-6">Sign in to see your profile.</p>
          <Link
            to="/login"
            className="text-[0.85rem] text-dg-accent no-underline py-2 px-4 border border-dg-accent/20 rounded-sm transition-all duration-150 hover:border-dg-accent/40"
          >
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="dg-page-enter text-dg-text flex-1 overflow-y-auto font-body">
      <div className="max-w-[1100px] mx-auto px-g3 py-4 sm:py-6">
        <ProfileContent handle={auth.handle} authMethod={auth.authMethod} />
      </div>
    </div>
  );
}

function ProfileContent({ handle, authMethod }: { handle: string; authMethod: string }) {
  const { entries } = Route.useLoaderData();
  const stats = computeStats(entries);

  const recent = [...entries]
    .sort((a, b) => {
      const tA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const tB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return tB - tA;
    })
    .slice(0, 12);

  const favorites = entries.filter((e) => e.isFavorite);

  return (
    <div className="flex flex-col gap-5">
      {/* Profile Header */}
      <ProfileHeader handle={handle} authMethod={authMethod} stats={stats} />

      {/* Recent Activity */}
      {recent.length > 0 && <RecentActivity items={recent} />}

      {/* Favorites */}
      {favorites.length > 0 && <FavoritesSection items={favorites} />}

      {/* Stamps */}
      <StampsSection entries={entries} />

      {/* Stats Breakdown */}
      {stats.total > 0 && <StatsBreakdown stats={stats} />}
    </div>
  );
}

// ─── Profile Header ──────────────────────────────────────────────────────────

function ProfileHeader({
  handle,
  authMethod,
  stats,
}: {
  handle: string;
  authMethod: string;
  stats: ReturnType<typeof computeStats>;
}) {
  const displayHandle = authMethod === "atproto" ? `@${handle}` : handle;

  return (
    <div className="border border-dg-border-subtle rounded bg-dg-surface p-4 sm:p-5">
      <div className="flex items-start gap-4">
        {/* Avatar placeholder */}
        <div
          className="w-14 h-14 sm:w-16 sm:h-16 rounded-full shrink-0 flex items-center justify-center border border-dg-border"
          style={{
            background:
              "linear-gradient(135deg, var(--color-dg-accent) 0%, hsl(25, 70%, 35%) 100%)",
          }}
        >
          <span className="text-white font-display text-[1.3rem] sm:text-[1.5rem] font-semibold select-none">
            {handle.charAt(0).toUpperCase()}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <h1 className="font-display text-[1.3rem] sm:text-[1.5rem] font-normal text-dg-text truncate leading-tight">
            {displayHandle}
          </h1>
          <p className="text-[0.75rem] text-dg-text-tertiary mt-0.5">
            {authMethod === "atproto"
              ? "AT Protocol"
              : authMethod === "google"
                ? "Google"
                : "GitHub"}
          </p>

          {/* Quick stats row */}
          <div className="flex items-center gap-4 mt-3">
            <StatPill label="tracked" value={stats.total} />
            <StatPill label="completed" value={stats.completed} />
            <StatPill label="rated" value={stats.rated} />
            {stats.avgRating != null && (
              <StatPill
                label="avg"
                value={stats.avgRating}
                suffix="/100"
                color={ratingColor(stats.avgRating) ?? undefined}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatPill({
  label,
  value,
  suffix,
  color,
}: {
  label: string;
  value: number;
  suffix?: string;
  color?: string;
}) {
  return (
    <div className="text-center">
      <div
        className="text-[0.9rem] sm:text-[1rem] font-mono tabular-nums"
        style={color ? { color } : undefined}
      >
        {value}
        {suffix && <span className="text-[0.65rem] text-dg-text-tertiary">{suffix}</span>}
      </div>
      <div className="text-[0.6rem] text-dg-text-tertiary uppercase tracking-wider">{label}</div>
    </div>
  );
}

// ─── Recent Activity ─────────────────────────────────────────────────────────

function RecentActivity({ items }: { items: CatalogEntryRow[] }) {
  return (
    <div>
      <SectionHeader
        label="Recent Activity"
        color="var(--color-dg-accent)"
        count={items.length}
        icon="\u25B8"
      />
      <div className="overflow-x-auto pb-2 [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden">
        <div className="flex gap-2.5">
          {items.map((item, i) => (
            <ActivityCard key={item.id} item={item} index={i} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ActivityCard({ item, index }: { item: CatalogEntryRow; index: number }) {
  const statusLabel = item.status
    ? (STATUS_LABELS_GENERIC[item.status as StatusValue] ?? item.status)
    : null;

  return (
    <Link
      to="/catalog/$wikidataId"
      params={{ wikidataId: item.mediaWikidataId }}
      className="shrink-0 w-[110px] no-underline text-inherit group"
      onClick={() => SoundEngine.navForward()}
      style={{
        animation: `fadeIn 320ms var(--ease-smooth) both ${index * 30}ms`,
      }}
    >
      <div className="w-full aspect-[2/3] rounded overflow-hidden relative">
        <div className="w-full h-full transition-transform duration-200 ease-out group-hover:scale-[1.03]">
          <CoverThumb
            title={item.mediaTitle ?? "?"}
            mediaType={
              item.mediaType ? displayMediaType(item.mediaType, item.animationOrigin) : undefined
            }
            size={110}
            posterUrl={item.posterUrl ?? undefined}
            loading="eager"
          />
        </div>
      </div>
      <div className="mt-1 text-[0.65rem] font-medium text-dg-text truncate group-hover:text-dg-accent transition-colors">
        {item.isFavorite && (
          <Star size={9} weight="fill" className="text-dg-accent mr-0.5 inline-block" />
        )}
        {item.mediaTitle ?? item.mediaWikidataId}
      </div>
      <div className="mt-0.5 flex items-center gap-1">
        <StampBadge
          type={displayMediaType(item.mediaType ?? "", item.animationOrigin)}
          index={index}
        />
        {item.rating != null && (
          <span
            className="text-[0.6rem] tabular-nums font-mono"
            style={{ color: ratingColor(item.rating) ?? "var(--color-dg-accent)" }}
          >
            {item.rating}
          </span>
        )}
      </div>
      {statusLabel && (
        <div className="text-[0.55rem] text-dg-text-tertiary mt-0.5 truncate">{statusLabel}</div>
      )}
    </Link>
  );
}

// ─── Favorites ───────────────────────────────────────────────────────────────

function FavoritesSection({ items }: { items: CatalogEntryRow[] }) {
  return (
    <div>
      <SectionHeader
        label="Favorites"
        color="var(--color-dg-accent)"
        count={items.length}
        icon="\u2605"
      />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-g1">
        {items.map((item, i) => (
          <Link
            key={item.id}
            to="/catalog/$wikidataId"
            params={{ wikidataId: item.mediaWikidataId }}
            className="no-underline text-inherit cursor-pointer group"
            onClick={() => SoundEngine.navForward()}
            style={{
              animation: `fadeIn 320ms var(--ease-smooth) both ${i * 30}ms`,
            }}
          >
            <div className="w-full aspect-[2/3] rounded overflow-hidden relative">
              <div className="w-full h-full transition-transform duration-200 ease-out group-hover:scale-[1.03]">
                <CoverThumb
                  title={item.mediaTitle ?? "?"}
                  mediaType={
                    item.mediaType
                      ? displayMediaType(item.mediaType, item.animationOrigin)
                      : undefined
                  }
                  size={160}
                  posterUrl={item.posterUrl ?? undefined}
                  loading="lazy"
                />
              </div>
            </div>
            <div className="mt-1 text-xs font-medium text-dg-text truncate group-hover:text-dg-accent transition-colors">
              <Star size={10} weight="fill" className="text-dg-accent mr-0.5 inline-block" />
              {item.mediaTitle ?? item.mediaWikidataId}
            </div>
            <div className="mt-0.5 flex items-center gap-1">
              <StampBadge
                type={displayMediaType(item.mediaType ?? "", item.animationOrigin)}
                index={i}
              />
              {item.rating != null && (
                <span
                  className="text-[0.65rem] tabular-nums font-mono"
                  style={{ color: ratingColor(item.rating) ?? "var(--color-dg-accent)" }}
                >
                  {item.rating}/100
                </span>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ─── Stamps ──────────────────────────────────────────────────────────────────

function StampsSection({ entries }: { entries: CatalogEntryRow[] }) {
  const earned = STAMPS.filter((s) => isStampEarned(s, entries));
  const locked = STAMPS.filter((s) => !isStampEarned(s, entries));

  return (
    <div>
      <SectionHeader
        label="Stamps"
        color="var(--color-dg-sealed)"
        count={`${earned.length}/${STAMPS.length}`}
        icon="\u2726"
      />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {earned.map((stamp, i) => (
          <StampCard key={stamp.id} stamp={stamp} earned index={i} />
        ))}
        {locked.map((stamp, i) => (
          <StampCard key={stamp.id} stamp={stamp} earned={false} index={earned.length + i} />
        ))}
      </div>
    </div>
  );
}

function StampCard({ stamp, earned, index }: { stamp: Stamp; earned: boolean; index: number }) {
  return (
    <div
      className="border rounded p-3 sm:p-4 text-center transition-all duration-200"
      style={{
        borderColor: earned ? stamp.color : "var(--color-dg-border-subtle)",
        background: earned ? undefined : "var(--color-dg-surface)",
        opacity: earned ? 1 : 0.4,
        animation: `fadeIn 320ms var(--ease-smooth) both ${index * 40}ms`,
      }}
    >
      <div
        className="text-[1.5rem] sm:text-[1.8rem] mb-1"
        style={{ filter: earned ? "none" : "grayscale(1)" }}
      >
        {stamp.icon}
      </div>
      <div
        className="text-[0.7rem] font-bold tracking-[0.08em] uppercase"
        style={{ color: earned ? stamp.color : "var(--color-dg-text-tertiary)" }}
      >
        {stamp.label}
      </div>
      <div className="text-[0.6rem] text-dg-text-tertiary mt-0.5 leading-relaxed">
        {stamp.description}
      </div>
    </div>
  );
}

// ─── Stats Breakdown ─────────────────────────────────────────────────────────

const STATUS_SECTION_COLORS: Record<StatusValue, string> = {
  planned: "var(--color-dg-charted)",
  in_progress: "var(--color-dg-enroute)",
  on_hold: "var(--color-dg-paused)",
  completed: "var(--color-dg-stamped)",
  mastered: "var(--color-dg-sealed)",
  dropped: "var(--color-dg-dropped)",
};

function StatsBreakdown({ stats }: { stats: ReturnType<typeof computeStats> }) {
  const statusEntries = [...stats.byStatus.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <div>
      <SectionHeader
        label="Breakdown"
        color="var(--color-dg-text-secondary)"
        count={stats.total}
        icon="\u25A0"
      />
      <div className="border border-dg-border-subtle rounded bg-dg-surface p-4 sm:p-5">
        <div className="flex flex-col gap-2">
          {statusEntries.map(([status, count]) => {
            const s = status as StatusValue;
            const color = STATUS_SECTION_COLORS[s] ?? "var(--color-dg-text-secondary)";
            const pct = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;

            return (
              <div key={status} className="flex items-center gap-3">
                <span
                  className="text-[0.75rem] font-bold tracking-[0.06em] uppercase w-24 shrink-0"
                  style={{ color }}
                >
                  {STATUS_LABELS_GENERIC[s] ?? status}
                </span>
                <div className="flex-1 h-[6px] rounded-full bg-dg-border-subtle overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${pct}%`,
                      background: color,
                      minWidth: count > 0 ? 4 : 0,
                    }}
                  />
                </div>
                <span className="text-[0.7rem] text-dg-text-tertiary tabular-nums font-mono w-12 text-right shrink-0">
                  {count}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

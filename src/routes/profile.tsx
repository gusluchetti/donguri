import { createFileRoute, getRouteApi, Link, redirect } from "@tanstack/react-router";
import { getAuthState } from "~/features/auth/auth.functions";
import { getUserCatalogEntries } from "~/features/catalog/catalog.functions";
import { SoundEngine } from "~/features/catalog/catalog.sound";
import { CoverThumb } from "~/features/catalog/components/CoverThumb";
import { StampBadge } from "~/features/catalog/components/StampBadge";
import { SectionHeader } from "~/features/media/components/SectionHeader";
import {
  displayMediaType,
  STATUS_ICONS,
  STATUS_LABELS_GENERIC,
  type StatusValue,
} from "~/features/media/media-types";
import { ogTags, pageTitle } from "~/lib/og";

const rootRoute = getRouteApi("__root__");

// ─── Types ────────────────────────────────────────────────────────────────────

type CatalogRow = Awaited<ReturnType<typeof getUserCatalogEntries>>[number];

type Seal = {
  id: number;
  name: string;
  desc: string;
  tier: "common" | "rare" | "legendary";
  icon: string;
  earned: boolean;
};

// ─── Computed stats helpers ────────────────────────────────────────────────────

function computeStats(entries: CatalogRow[]) {
  const stamps = entries.filter((e) => e.status === "completed" || e.status === "mastered").length;

  // Rough hours estimate: movies ~2h, tv episodes tracked, anime ~0.5h/ep avg, games ~30h avg
  let hoursWatched = 0;
  for (const e of entries) {
    if (e.status !== "completed" && e.status !== "mastered") continue;
    const type = e.mediaType ?? "";
    if (type === "game") {
      hoursWatched += 30;
    } else if (type === "tv_series") {
      const watched = e.episodeProgress ?? e.episodeCount ?? 10;
      hoursWatched += Math.round(watched * 0.4); // ~24 min/ep
    } else {
      // movie / anime
      hoursWatched += 2;
    }
  }

  // Top territory by entry count
  const typeCounts: Record<string, number> = {};
  for (const e of entries) {
    const t = displayMediaType(e.mediaType ?? "", e.animationOrigin ?? null);
    typeCounts[t] = (typeCounts[t] ?? 0) + 1;
  }
  const topTerritory = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

  const topTerritoryLabel: Record<string, string> = {
    movie: "Movies",
    tv_series: "TV",
    anime: "Anime",
    game: "Games",
  };

  // Streak: consecutive days with a completedAt within last N entries
  // Simple: count unique days in the last 60 days where updatedAt exists
  const now = new Date();
  const recentDays = new Set<string>();
  for (const e of entries) {
    if (!e.updatedAt) continue;
    const d = new Date(e.updatedAt);
    const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
    if (diffDays <= 60) {
      recentDays.add(d.toISOString().slice(0, 10));
    }
  }

  // Build streak from today backwards
  let currentStreak = 0;
  let longestStreak = 0;
  let streak = 0;
  for (let i = 0; i < 60; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    if (recentDays.has(key)) {
      streak++;
      if (i === 0 || i === currentStreak) currentStreak = streak;
      if (streak > longestStreak) longestStreak = streak;
    } else {
      if (i > 0 && i <= currentStreak) {
        // gap found — end current streak
        currentStreak = streak > 0 ? currentStreak : 0;
      }
      streak = 0;
    }
  }

  const daysSinceFirst =
    entries.length > 0
      ? Math.floor(
          (now.getTime() -
            new Date(
              entries.reduce(
                (min, e) =>
                  e.updatedAt && new Date(e.updatedAt) < min ? new Date(e.updatedAt) : min,
                now,
              ),
            ).getTime()) /
            86400000,
        )
      : 0;

  return {
    stamps,
    hoursWatched,
    topTerritory: topTerritoryLabel[topTerritory] ?? topTerritory,
    currentStreak,
    longestStreak,
    daysSinceFirst,
  };
}

function computeSeals(entries: CatalogRow[]): Seal[] {
  const completed = entries.filter((e) => e.status === "completed" || e.status === "mastered");
  const mastered = entries.filter((e) => e.status === "mastered");
  const inProgress = entries.filter((e) => e.status === "in_progress");
  const withNotes = entries.filter((e) => e.note && e.note.trim().length > 0);
  const rated = entries.filter((e) => e.rating != null);
  const favorites = entries.filter((e) => e.isFavorite);

  const types = new Set(
    entries.map((e) => displayMediaType(e.mediaType ?? "", e.animationOrigin ?? null)),
  );

  // Streak data for night owl (any updatedAt late at night — we skip without time data in updatedAt)
  const hasLateNight = entries.some((e) => {
    if (!e.updatedAt) return false;
    const h = new Date(e.updatedAt).getHours();
    return h >= 23 || h < 4;
  });

  return [
    {
      id: 1,
      name: "First Stamp",
      desc: "Complete your first title",
      tier: "common",
      icon: "■",
      earned: completed.length >= 1,
    },
    {
      id: 2,
      name: "Completionist",
      desc: "Complete 5 titles",
      tier: "common",
      icon: "\u2713",
      earned: completed.length >= 5,
    },
    {
      id: 3,
      name: "Night Owl",
      desc: "Update your catalog late at night",
      tier: "common",
      icon: "\u25d7",
      earned: hasLateNight,
    },
    {
      id: 4,
      name: "Explorer",
      desc: "Track titles across all 4 territories",
      tier: "rare",
      icon: "\u25c8",
      earned: types.size >= 4,
    },
    {
      id: 5,
      name: "Critic",
      desc: "Rate 10 titles",
      tier: "rare",
      icon: "\u2605",
      earned: rated.length >= 10,
    },
    {
      id: 6,
      name: "Sealed Master",
      desc: "Mark a title as Mastered",
      tier: "rare",
      icon: "\u25c9",
      earned: mastered.length >= 1,
    },
    {
      id: 7,
      name: "Devoted",
      desc: "Add 5 favorites",
      tier: "rare",
      icon: "\u2665",
      earned: favorites.length >= 5,
    },
    {
      id: 8,
      name: "Archivist",
      desc: "Write notes on 10 titles",
      tier: "legendary",
      icon: "\u2261",
      earned: withNotes.length >= 10,
    },
    {
      id: 9,
      name: "Century",
      desc: "Complete 100 titles",
      tier: "legendary",
      icon: "\u2726",
      earned: completed.length >= 100,
    },
    {
      id: 10,
      name: "On A Roll",
      desc: "Track 10 titles in progress at once",
      tier: "legendary",
      icon: "\u25b8\u25b8",
      earned: inProgress.length >= 10,
    },
  ];
}

function getRecentActivity(entries: CatalogRow[]) {
  return [...entries]
    .filter((e) => e.status != null)
    .sort((a, b) => {
      const tA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const tB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return tB - tA;
    })
    .slice(0, 8);
}

// ─── Route ────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/profile")({
  beforeLoad: async () => {
    const auth = await getAuthState();
    if (!auth) throw redirect({ to: "/login" });
  },
  loader: async () => {
    const entries = await getUserCatalogEntries().catch(() => [] as CatalogRow[]);
    return { entries };
  },
  staleTime: 2 * 60 * 1000,
  head: () => ({
    meta: [
      { title: pageTitle("profile") },
      ...ogTags({
        title: "profile — donguri",
        description: "Your tracking profile.",
        path: "/profile",
      }),
    ],
  }),
  component: ProfilePage,
});

// ─── Page ─────────────────────────────────────────────────────────────────────

function ProfilePage() {
  const { auth } = rootRoute.useLoaderData();
  const { entries } = Route.useLoaderData();

  if (!auth) {
    return (
      <div className="flex-1 flex items-center justify-center font-body text-dg-text">
        <div className="text-center">
          <p className="text-dg-text-secondary mb-4">
            You need to be signed in to view your profile.
          </p>
          <Link
            to="/login"
            className="text-dg-accent no-underline text-sm border border-dg-accent/30 rounded-sm px-4 py-2"
          >
            sign in
          </Link>
        </div>
      </div>
    );
  }

  const stats = computeStats(entries);
  const seals = computeSeals(entries);
  const recentActivity = getRecentActivity(entries);
  const earnedSeals = seals.filter((s) => s.earned).length;

  const handle = auth.authMethod === "atproto" ? `@${auth.handle}` : auth.handle;
  const initials = (auth.handle?.[0] ?? "?").toUpperCase();

  return (
    <div className="dg-page-enter text-dg-text flex-1 overflow-y-auto font-body">
      <div className="max-w-[900px] mx-auto px-g3 py-4 sm:py-6">
        {/* Profile Header */}
        <div
          className="border border-dg-border-subtle rounded-lg bg-dg-surface p-4 sm:p-6 mb-4"
          style={{ animation: "fadeIn 280ms var(--ease-smooth) both" }}
        >
          <div className="flex items-center gap-4 mb-5">
            {/* Avatar */}
            <div
              className="w-14 h-14 sm:w-16 sm:h-16 rounded-full shrink-0 flex items-center justify-center border-2 border-dg-border"
              style={{
                background:
                  "linear-gradient(135deg, var(--color-dg-accent), var(--color-dg-anime))",
              }}
            >
              <span className="font-display text-white font-bold text-2xl">{initials}</span>
            </div>
            <div>
              <h1 className="font-display text-2xl sm:text-3xl font-normal tracking-tight text-dg-text">
                {auth.handle}
              </h1>
              <div className="text-xs text-dg-text-tertiary mt-0.5">{handle}</div>
            </div>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {[
              { label: "Stamps", value: stats.stamps },
              { label: "Hours", value: stats.hoursWatched },
              { label: "Streak", value: `${stats.currentStreak}d` },
              { label: "Best", value: `${stats.longestStreak}d` },
              { label: "Territory", value: stats.topTerritory },
              { label: "Days Active", value: stats.daysSinceFirst },
            ].map((s) => (
              <div
                key={s.label}
                className="p-2 sm:p-3 bg-dg-elevated rounded border border-dg-border-subtle text-center"
              >
                <div className="text-base sm:text-lg font-bold text-dg-text tabular-nums">
                  {s.value}
                </div>
                <div className="text-[9px] uppercase tracking-wider text-dg-text-tertiary mt-0.5">
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Seals */}
        <div className="mb-4" style={{ animation: "fadeIn 280ms var(--ease-smooth) both 60ms" }}>
          <SectionHeader
            label="Seals"
            color="var(--color-dg-accent)"
            count={`${earnedSeals}/${seals.length}`}
            icon="\u2726"
          />
          <div className="flex gap-4 sm:gap-5 overflow-x-auto pb-2 scrollbar-hide">
            {seals.map((seal, i) => (
              <SealBadge
                key={seal.id}
                seal={seal}
                style={{ animation: `fadeIn 280ms var(--ease-smooth) both ${i * 40}ms` }}
              />
            ))}
          </div>
        </div>

        {/* Recent Activity */}
        {recentActivity.length > 0 && (
          <div style={{ animation: "fadeIn 280ms var(--ease-smooth) both 120ms" }}>
            <SectionHeader
              label="Recent Activity"
              color="var(--color-dg-accent)"
              count={recentActivity.length}
              icon="\u25ce"
            />
            <div className="border border-dg-border-subtle rounded bg-dg-surface overflow-hidden">
              {recentActivity.map((entry, i) => (
                <ActivityRow
                  key={entry.id}
                  entry={entry}
                  index={i}
                  isLast={i === recentActivity.length - 1}
                />
              ))}
            </div>
          </div>
        )}

        {entries.length === 0 && (
          <div className="border border-dg-border-subtle rounded p-5 bg-dg-surface text-center text-dg-text-secondary text-sm">
            Your catalog is empty.{" "}
            <Link
              to="/catalog"
              onClick={() => SoundEngine.click()}
              className="text-dg-accent no-underline"
            >
              Browse the catalog
            </Link>{" "}
            to start tracking.
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Seal Badge ───────────────────────────────────────────────────────────────

function SealBadge({ seal, style }: { seal: Seal; style?: React.CSSProperties }) {
  const tierColor = `var(--color-dg-seal-${seal.tier})`;
  const size = 52;

  return (
    <div
      className="flex flex-col items-center gap-1 shrink-0"
      style={{
        width: size + 12,
        opacity: seal.earned ? 1 : 0.25,
        filter: seal.earned ? "none" : "grayscale(1)",
        cursor: seal.earned ? "default" : "default",
        ...style,
      }}
      title={`${seal.name}: ${seal.desc}`}
    >
      <div
        className="rounded-full flex items-center justify-center relative"
        style={{
          width: size,
          height: size,
          border: `2px solid ${tierColor}`,
          background: "var(--stamp-bg)",
          boxShadow:
            seal.earned && seal.tier === "legendary"
              ? `0 0 14px ${tierColor}40, inset 0 0 10px ${tierColor}15`
              : seal.earned && seal.tier === "rare"
                ? `0 0 6px ${tierColor}25`
                : "none",
        }}
      >
        {seal.earned && (
          <div
            className="absolute rounded-full pointer-events-none"
            style={{
              inset: 3,
              border: `1px solid ${tierColor}`,
              opacity: 0.35,
            }}
          />
        )}
        <span className="font-body font-bold relative" style={{ fontSize: 16, color: tierColor }}>
          {seal.icon}
        </span>
        {seal.earned && seal.tier === "legendary" && (
          <div
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{
              background: `linear-gradient(90deg, transparent 0%, ${tierColor}15 50%, transparent 100%)`,
              backgroundSize: "200% 100%",
              animation: "shimmer 3s ease-in-out infinite",
            }}
          />
        )}
      </div>
      <span
        className="text-[8px] font-semibold tracking-wider uppercase text-center leading-tight"
        style={{
          color: seal.earned ? tierColor : "var(--color-dg-text-tertiary)",
          maxWidth: size + 12,
        }}
      >
        {seal.name}
      </span>
    </div>
  );
}

// ─── Activity Row ─────────────────────────────────────────────────────────────

function ActivityRow({
  entry,
  index,
  isLast,
}: {
  entry: CatalogRow;
  index: number;
  isLast: boolean;
}) {
  const status = entry.status as StatusValue | null;
  const icon = status ? (STATUS_ICONS[status] ?? "\u00b7") : "\u00b7";
  const label = status ? (STATUS_LABELS_GENERIC[status] ?? status) : "";
  const date = entry.updatedAt
    ? new Date(entry.updatedAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "";

  const statusColors: Record<string, string> = {
    completed: "var(--color-dg-stamped)",
    mastered: "var(--color-dg-sealed)",
    in_progress: "var(--color-dg-enroute)",
    planned: "var(--color-dg-charted)",
    on_hold: "var(--color-dg-paused)",
    dropped: "var(--color-dg-dropped)",
  };

  const color = status
    ? (statusColors[status] ?? "var(--color-dg-text-tertiary)")
    : "var(--color-dg-text-tertiary)";

  return (
    <Link
      to="/catalog/$wikidataId"
      params={{ wikidataId: entry.mediaWikidataId }}
      className="flex items-center gap-3 px-4 py-2.5 no-underline text-inherit transition-all duration-100 group hover:bg-dg-row-hover"
      style={{
        borderBottom: isLast ? "none" : "1px solid var(--color-dg-border-subtle)",
        animation: `fadeIn 280ms var(--ease-smooth) both ${index * 30}ms`,
      }}
      onClick={() => SoundEngine.navForward()}
      onMouseEnter={() => SoundEngine.tick()}
    >
      <span className="text-[11px] w-4 text-center shrink-0" style={{ color }}>
        {icon}
      </span>
      <CoverThumb
        title={entry.mediaTitle ?? "?"}
        mediaType={displayMediaType(entry.mediaType ?? "", entry.animationOrigin ?? null)}
        posterUrl={entry.posterUrl ?? undefined}
        size={28}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-dg-text truncate">
            {entry.mediaTitle ?? entry.mediaWikidataId}
          </span>
          <StampBadge
            type={displayMediaType(entry.mediaType ?? "", entry.animationOrigin ?? null)}
            index={index + 10}
          />
        </div>
        <div className="text-xs text-dg-text-tertiary mt-0.5" style={{ color }}>
          {label}
        </div>
      </div>
      {entry.note && (
        <div className="hidden sm:block text-xs text-dg-text-secondary italic max-w-[200px] truncate shrink-0">
          "{entry.note}"
        </div>
      )}
      <span className="text-xs text-dg-text-tertiary tabular-nums shrink-0 ml-auto">{date}</span>
    </Link>
  );
}

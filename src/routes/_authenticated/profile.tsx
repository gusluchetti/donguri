import { ClockCounterClockwise, Gear } from "@phosphor-icons/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { clear } from "idb-keyval";
import { useCallback, useEffect, useState } from "react";
import { LinkButton } from "~/components/LinkButton";
import { logout } from "~/features/auth/auth.functions";
import { SoundEngine } from "~/features/catalog/catalog.sound";
import { CoverThumb } from "~/features/catalog/components/CoverThumb";
import { StampBadge } from "~/features/catalog/components/StampBadge";
import { StatusBadge } from "~/features/catalog/components/StatusBadge";
import { StatusIcon } from "~/features/catalog/components/StatusIcon";
import { SectionHeader } from "~/features/media/components/SectionHeader";
import {
  displayMediaType,
  STAMP_COLORS,
  STATUS_ORDER,
  type StatusValue,
} from "~/features/media/media-types";
import type { ProfileData } from "~/features/profile/profile.functions";
import { profileDataOptions } from "~/features/profile/profile.queries";
import { ogTags, pageTitle } from "~/lib/og";

export const Route = createFileRoute("/_authenticated/profile")({
  loader: async ({ context }) => {
    await context.queryClient.prefetchQuery(profileDataOptions());
    return {};
  },
  staleTime: 5 * 60 * 1000,
  head: () => ({
    meta: [
      { title: pageTitle("profile — donguri") },
      ...ogTags({
        title: "profile — donguri",
        description: "Your tracking stats and recent activity.",
        path: "/profile",
      }),
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { data } = useSuspenseQuery(profileDataOptions());
  const { stats, recent, user, daysActive } = data;
  const handleLogout = useCallback(async () => {
    await logout();
    clear();
    window.location.href = "/";
  }, []);

  if (stats.totalEntries === 0) {
    return (
      <div className="dg-page-enter text-dg-text flex-1 overflow-y-auto font-body">
        <div className="max-w-[1100px] mx-auto px-g3 py-g3 sm:py-g4">
          <ProfileHeader user={user} daysActive={daysActive} onLogout={handleLogout} />
          <div className="flex flex-col items-center justify-center py-g8 gap-g2">
            <p className="font-display text-[1.3rem] text-dg-text-secondary">
              nothing tracked yet.
            </p>
            <LinkButton to="/catalog" variant="accent" onClick={() => SoundEngine.click()}>
              explore catalog
            </LinkButton>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dg-page-enter text-dg-text flex-1 overflow-y-auto font-body">
      <div className="max-w-[1100px] mx-auto px-g3 py-g3 sm:py-g4 flex flex-col gap-g3">
        <ProfileHeader user={user} daysActive={daysActive} onLogout={handleLogout} />
        <StatsGrid stats={stats} daysActive={daysActive} />
        <TerritoryBar typeCounts={stats.typeCounts} totalEntries={stats.totalEntries} />
        <StatusBreakdown statusCounts={stats.statusCounts} />
        <RecentTrail entries={recent} />
      </div>
    </div>
  );
}

// ─── Profile Header ────────────────────────────────────────────────────────

function ProfileHeader({
  user,
  daysActive,
  onLogout,
}: {
  user: ProfileData["user"];
  daysActive: number;
  onLogout: () => void;
}) {
  const authLabel =
    user.authMethod === "atproto" ? "bsky" : user.authMethod === "google" ? "google" : "github";

  const memberSince = user.createdAt
    ? new Date(user.createdAt).toLocaleDateString("en-US", {
        month: "short",
        year: "numeric",
      })
    : null;

  return (
    <div className="border border-dg-border-subtle rounded bg-dg-surface p-4 sm:p-5 flex flex-col gap-3">
      <div className="flex items-center gap-g2">
        <Avatar handle={user.handle} avatarUrl={user.avatarUrl} authMethod={user.authMethod} />
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="font-display text-[1.5rem] leading-tight truncate">{user.handle}</span>
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="inline-block font-body text-[8px] font-bold tracking-[0.12em] uppercase rounded-[1px] whitespace-nowrap"
              style={{
                color: "var(--color-dg-text-tertiary)",
                border: "1px solid var(--color-dg-border)",
                padding: "0px 4px",
                background: "var(--stamp-bg)",
              }}
            >
              {authLabel}
            </span>
            {memberSince && (
              <span className="font-mono text-[0.7rem] text-dg-text-tertiary tabular-nums">
                since {memberSince} · {daysActive}d
              </span>
            )}
          </div>
        </div>
        <Link
          to="/settings"
          className="ml-auto self-start text-dg-text-tertiary hover:text-dg-text-secondary transition-colors no-underline"
          onClick={() => SoundEngine.navForward()}
        >
          <Gear size={20} weight="bold" />
        </Link>
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onLogout}
          className="dg-press bg-transparent border-none font-body text-[0.7rem] text-dg-accent/50 hover:text-dg-accent/80 p-0"
        >
          logout
        </button>
      </div>
    </div>
  );
}

function Avatar({
  handle,
  avatarUrl,
  authMethod,
}: {
  handle: string;
  avatarUrl: string | null;
  authMethod: string;
}) {
  if (avatarUrl && authMethod !== "atproto") {
    return (
      <img
        src={avatarUrl}
        alt=""
        className="w-14 h-14 rounded-full shrink-0 border border-dg-border"
      />
    );
  }

  // Monogram circle for AT users or users without avatar
  const letter = (handle[0] ?? "?").toUpperCase();
  return (
    <div
      className="w-14 h-14 rounded-full shrink-0 flex items-center justify-center font-display text-[1.3rem] font-semibold border border-dg-border"
      style={{
        background:
          "linear-gradient(135deg, var(--color-dg-accent-soft), var(--color-dg-elevated))",
        color: "var(--color-dg-accent)",
      }}
    >
      {letter}
    </div>
  );
}

// ─── Stats Grid ────────────────────────────────────────────────────────────

function StatsGrid({ stats, daysActive }: { stats: ProfileData["stats"]; daysActive: number }) {
  const finished = stats.statusCounts.completed + stats.statusCounts.mastered;
  const avgDisplay = stats.avgRating != null ? (stats.avgRating / 10).toFixed(1) : "\u2014";

  const cells = [
    { value: stats.totalEntries, label: "Tracked" },
    { value: finished, label: "Finished" },
    { value: stats.favoritesCount, label: "Favorites" },
    { value: avgDisplay, label: "Avg Rating" },
    { value: stats.totalReplays, label: "Replayed" },
    { value: daysActive, label: "Days" },
  ];

  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
      {cells.map((cell, i) => (
        <div
          key={cell.label}
          className="bg-dg-surface border border-dg-border-subtle rounded p-3 text-center"
          style={{
            animation: `fadeIn 50ms ${15 * i}ms both`,
          }}
        >
          <div className="font-display text-[1.5rem] tabular-nums leading-tight">{cell.value}</div>
          <div className="text-[0.6rem] uppercase tracking-wider text-dg-text-tertiary mt-0.5">
            {cell.label}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Territory Bar ─────────────────────────────────────────────────────────

const TERRITORY_TYPES = ["movie", "tv_series", "anime", "game"] as const;

function TerritoryBar({
  typeCounts,
  totalEntries,
}: {
  typeCounts: Record<string, number>;
  totalEntries: number;
}) {
  if (totalEntries === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex rounded overflow-hidden h-2">
        {TERRITORY_TYPES.map((type) => {
          const count = typeCounts[type] ?? 0;
          if (count === 0) return null;
          const pct = (count / totalEntries) * 100;
          return (
            <div
              key={type}
              style={{
                width: `${pct}%`,
                background: STAMP_COLORS[type],
                minWidth: count > 0 ? 4 : 0,
              }}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-3">
        {TERRITORY_TYPES.map((type, i) => {
          const count = typeCounts[type] ?? 0;
          return (
            <div
              key={type}
              className="flex items-center gap-1.5"
              style={{ opacity: count === 0 ? 0.3 : 1 }}
            >
              <StampBadge type={type} index={i} />
              <span className="text-[0.7rem] text-dg-text-secondary tabular-nums">{count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Status Breakdown ──────────────────────────────────────────────────────

function StatusBreakdown({ statusCounts }: { statusCounts: Record<StatusValue, number> }) {
  return (
    <div className="flex flex-wrap gap-3">
      {STATUS_ORDER.map((status) => {
        const count = statusCounts[status] ?? 0;
        return (
          <div
            key={status}
            className="flex items-center gap-1.5"
            style={{ opacity: count === 0 ? 0.3 : 1 }}
          >
            <StatusBadge status={status} compact />
            <span className="text-[0.7rem] text-dg-text-secondary tabular-nums">{count}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Recent Trail ──────────────────────────────────────────────────────────

function computeRelative(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 0) return "today";
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(days / 365);
  return `${years}y ago`;
}

function RelativeTime({ dateStr }: { dateStr: string | null }) {
  const [text, setText] = useState("");
  useEffect(() => {
    if (dateStr) setText(computeRelative(dateStr));
  }, [dateStr]);
  return <>{text}</>;
}

function RecentTrail({ entries }: { entries: ProfileData["recent"] }) {
  if (entries.length === 0) return null;

  return (
    <div>
      <SectionHeader
        label="recent trail"
        color="var(--color-dg-accent)"
        count={entries.length}
        icon={<ClockCounterClockwise size={12} weight="bold" />}
      />
      <div className="flex flex-col">
        {entries.map((entry, i) => {
          const type = displayMediaType(entry.mediaType ?? "movie", entry.animationOrigin);
          return (
            <Link
              key={entry.mediaWikidataId}
              to="/catalog/$wikidataId"
              params={{ wikidataId: entry.mediaWikidataId }}
              className="flex items-center gap-g1 px-2 py-1.5 rounded no-underline text-dg-text hover:bg-dg-row-hover transition-all duration-50 hover:translate-x-[3px]"
              style={{
                animation: `fadeIn 50ms ${8 * i}ms both`,
              }}
              onClick={() => SoundEngine.navForward()}
            >
              <CoverThumb
                mediaType={type}
                title={entry.mediaTitle ?? ""}
                size={32}
                posterUrl={entry.posterUrl ?? undefined}
              />
              <span className="flex-1 min-w-0 text-[0.8rem] truncate">
                {entry.mediaTitle ?? "Untitled"}
              </span>
              <StampBadge type={type} index={i} />
              <span className="text-[10px] text-dg-text-tertiary w-4 text-center shrink-0 flex items-center justify-center">
                <StatusIcon status={(entry.status as StatusValue) ?? "planned"} size={10} />
              </span>
              <span className="text-[0.65rem] text-dg-text-tertiary tabular-nums font-mono shrink-0 w-14 text-right">
                <RelativeTime dateStr={entry.updatedAt} />
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

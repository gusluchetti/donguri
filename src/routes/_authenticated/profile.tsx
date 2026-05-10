import { ClockCounterClockwise, Gear, SignOut } from "@phosphor-icons/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { clear } from "idb-keyval";
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
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
import { RangerPassCard, UpsellBanner } from "~/features/subscription/components/RangerPassCard";
import { isSubscriptionActive } from "~/features/subscription/subscription.utils";
import { ogTags, pageTitle } from "~/lib/og";

const RangerPassCard3D = lazy(() => import("~/features/subscription/components/RangerPassCard3D"));

export const Route = createFileRoute("/_authenticated/profile")({
  loader: async ({ context }) => {
    import("~/features/subscription/components/RangerPassCard3D").catch(() => {});
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
  const { stats, recent, user, daysActive, subscription } = data;
  const handleLogout = useCallback(async () => {
    await logout();
    clear();
    window.location.href = "/";
  }, []);

  const hasActiveSub = isSubscriptionActive(subscription);

  return (
    <div className="dg-page-enter text-dg-text flex-1 overflow-y-auto font-body">
      <div className="max-w-[1100px] mx-auto px-g3 py-g3 sm:py-g4 flex flex-col gap-g3">
        {!hasActiveSub && <UpsellBanner />}
        <ProfileHeader
          user={user}
          daysActive={daysActive}
          onLogout={handleLogout}
          subscription={hasActiveSub ? subscription : null}
        />
        {stats.totalEntries === 0 ? (
          <div className="flex flex-col items-center justify-center py-g8 gap-g2">
            <p className="font-display text-[1.3rem] text-dg-text-secondary">
              nothing tracked yet.
            </p>
            <LinkButton to="/catalog" variant="accent" onClick={() => SoundEngine.click()}>
              explore catalog
            </LinkButton>
          </div>
        ) : (
          <>
            <StatsGrid stats={stats} daysActive={daysActive} />
            <TerritoryBar
              completedTypeCounts={stats.completedTypeCounts}
              typeCounts={stats.typeCounts}
              statusCounts={stats.statusCounts}
              statusByType={stats.statusByType}
            />
            <RecentTrail entries={recent} />
          </>
        )}
      </div>
    </div>
  );
}

function ProfileHeader({
  user,
  daysActive,
  onLogout,
  subscription,
}: {
  user: ProfileData["user"];
  daysActive: number;
  onLogout: () => void;
  subscription: { plan: string; status: string; createdAt: string | null } | null;
}) {
  const authLabel =
    user.authMethod === "atproto" ? "bsky" : user.authMethod === "google" ? "google" : "github";

  const memberSince = user.createdAt
    ? new Date(user.createdAt).toLocaleDateString("en-US", {
        month: "short",
        year: "numeric",
      })
    : null;

  const displayHandle = user.handle.replace(/\.bsky\.social$/, "");

  return (
    <div className="border border-dg-border-subtle rounded bg-dg-surface p-2 sm:p-3 flex flex-wrap items-center gap-g2">
      <Avatar handle={user.handle} avatarUrl={user.avatarUrl} authMethod={user.authMethod} />
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="font-display text-[1.5rem] leading-tight truncate">{displayHandle}</span>
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="inline-block font-mono text-[0.625rem] font-bold tracking-[0.12em] uppercase rounded-[1px] whitespace-nowrap"
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
      {subscription && (
        <Link
          to="/ranger-pass"
          className="ml-auto mr-0 sm:ml-0 sm:mr-0 order-last sm:order-none sm:ml-auto no-underline"
          onClick={() => SoundEngine.navForward()}
        >
          <Suspense
            fallback={
              <RangerPassCard handle={user.handle} plan={subscription.plan} maxWidth={140} />
            }
          >
            <RangerPassCard3D
              handle={user.handle}
              plan={subscription.plan}
              maxWidth={140}
              dpr={[1, 1]}
            />
          </Suspense>
        </Link>
      )}
      <div className={`${subscription ? "" : "ml-auto "}flex flex-col items-center gap-3 shrink-0`}>
        <Link
          to="/settings"
          className="text-dg-text-tertiary hover:text-dg-text-secondary transition-colors no-underline"
          onClick={() => SoundEngine.navForward()}
        >
          <Gear size={24} weight="bold" />
        </Link>
        <button
          type="button"
          onClick={onLogout}
          className="dg-press bg-transparent border-none text-dg-text-tertiary hover:text-dg-accent/80 transition-colors p-0 flex items-center"
        >
          <SignOut size={24} weight="bold" />
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

function StatsGrid({ stats, daysActive }: { stats: ProfileData["stats"]; daysActive: number }) {
  const finished = stats.statusCounts.completed + stats.statusCounts.mastered;
  const avgDisplay = stats.avgRating != null ? Math.round(stats.avgRating) : "\u2014";

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
          <div className="font-mono text-[1.5rem] tabular-nums leading-tight">{cell.value}</div>
          <div className="font-mono text-[0.625rem] uppercase tracking-wider text-dg-text-tertiary mt-0.5">
            {cell.label}
          </div>
        </div>
      ))}
    </div>
  );
}

const TERRITORY_TYPES = ["movie", "tv_series", "anime", "game"] as const;

const STATUS_BAR_COLORS: Record<StatusValue, string> = {
  planned: "var(--color-dg-charted)",
  in_progress: "var(--color-dg-enroute)",
  on_hold: "var(--color-dg-paused)",
  completed: "var(--color-dg-stamped)",
  mastered: "var(--color-dg-sealed)",
  dropped: "var(--color-dg-dropped)",
};

function TerritoryBar({
  completedTypeCounts,
  typeCounts,
  statusCounts,
  statusByType,
}: {
  completedTypeCounts: Record<string, number>;
  typeCounts: Record<string, number>;
  statusCounts: Record<StatusValue, number>;
  statusByType: Record<string, Record<string, number>>;
}) {
  const totalAll = TERRITORY_TYPES.reduce((sum, type) => sum + (typeCounts[type] ?? 0), 0);
  if (totalAll === 0) return null;

  return (
    <div className="flex flex-col w-full">
      <div className="flex rounded-t overflow-hidden h-5">
        {TERRITORY_TYPES.map((type) => {
          const count = typeCounts[type] ?? 0;
          if (count === 0) return null;
          const pct = (count / totalAll) * 100;
          return (
            <div
              key={type}
              className="relative flex items-center justify-center overflow-hidden"
              style={{
                width: `${pct}%`,
                background: STAMP_COLORS[type],
                minWidth: 24,
              }}
            >
              <span
                className="font-mono text-xs font-bold text-white tabular-nums"
                style={{ textShadow: "0 1px 2px rgba(0,0,0,0.5)" }}
              >
                {count}
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex rounded-b overflow-hidden h-3.5">
        {TERRITORY_TYPES.map((type) =>
          STATUS_ORDER.map((status) => {
            const count = statusByType[type]?.[status] ?? 0;
            if (count === 0) return null;
            const pct = (count / totalAll) * 100;
            return (
              <div
                key={`${type}-${status}`}
                className="relative flex items-center justify-center overflow-hidden"
                style={{
                  width: `${pct}%`,
                  background: STATUS_BAR_COLORS[status],
                  minWidth: 24,
                }}
              >
                <span
                  className="font-mono text-xs font-bold text-white tabular-nums"
                  style={{ textShadow: "0 1px 2px rgba(0,0,0,0.5)" }}
                >
                  {count}
                </span>
              </div>
            );
          }),
        )}
      </div>
      <div className="flex flex-wrap gap-g2 mt-g1">
        {TERRITORY_TYPES.map((type, i) => {
          const completed = completedTypeCounts[type] ?? 0;
          const total = typeCounts[type] ?? 0;
          return (
            <div
              key={type}
              className="flex items-center gap-1.5"
              style={{ opacity: total === 0 ? 0.3 : 1 }}
            >
              <StampBadge type={type} index={i} />
              <span className="font-mono text-[0.7rem] text-dg-text-secondary tabular-nums">
                {completed}/{total}
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-g2">
        {STATUS_ORDER.map((status) => {
          const count = statusCounts[status] ?? 0;
          return (
            <div
              key={status}
              className="flex items-center gap-1.5"
              style={{ opacity: count === 0 ? 0.3 : 1 }}
            >
              <StatusBadge status={status} compact />
              <span className="font-mono text-[0.7rem] text-dg-text-secondary tabular-nums">
                {count}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function computeRelative(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
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
    setText(dateStr ? computeRelative(dateStr) : "");
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
      <div className="flex flex-col border border-dg-border-subtle rounded bg-dg-surface">
        {entries.map((entry, i) => {
          const type = displayMediaType(entry.mediaType ?? "movie", entry.animationOrigin);
          const typeColor = STAMP_COLORS[type] ?? "var(--color-dg-accent)";
          return (
            <Link
              key={entry.mediaWikidataId}
              to="/catalog/$wikidataId"
              params={{ wikidataId: entry.mediaWikidataId }}
              className="flex items-center gap-g1 px-2 py-1.5 no-underline text-dg-text hover:bg-dg-row-hover transition-all duration-50 hover:translate-x-[3px] relative group"
              style={
                {
                  animation: `fadeIn 50ms ${8 * i}ms both`,
                  "--line-color": typeColor,
                } as React.CSSProperties
              }
              onClick={() => SoundEngine.navForward()}
            >
              <div className="absolute left-0 top-[15%] bottom-[15%] w-[2.5px] rounded-r-sm bg-transparent group-hover:bg-[var(--line-color)] transition-all duration-50 group-hover:shadow-[0_0_8px_var(--line-color)]" />
              <CoverThumb
                mediaType={type}
                title={entry.mediaTitle ?? ""}
                size={32}
                posterUrl={entry.posterUrl ?? undefined}
              />
              <span className="flex-1 min-w-0 text-[0.8rem] truncate">
                {entry.mediaTitle ?? "Untitled"}
              </span>
              <div className="w-5 shrink-0">
                <StampBadge type={type} index={i} />
              </div>
              <span className="text-[10px] text-dg-text-tertiary w-12 shrink-0 flex items-center justify-center">
                <StatusIcon status={entry.status ?? "planned"} size={10} />
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

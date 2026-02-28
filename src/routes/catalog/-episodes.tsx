import { useEffect, useRef, useState } from "react";
import {
  clearSeasonFrom,
  countSeasonWatched,
  countWatchedEpisodes,
  highestConsecutiveEpisode,
  markThroughEpisode,
  todayISO,
  type WatchedEpisodes,
} from "~/features/media/media-types";

export type Season = {
  id: string;
  seasonNumber: number;
  episodeCount: number | null;
  title: string | null;
  dataSource: string;
};

function SeasonProgressBar({
  label,
  watched,
  total,
  dim = false,
}: {
  label: string;
  watched: number;
  total: number;
  dim?: boolean;
}) {
  const pct = total > 0 ? Math.round((watched / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="text-[0.65rem] text-dg-text-tertiary tabular-nums w-6 shrink-0 font-mono">
        {label}
      </span>
      <div className="flex-1 h-[6px] bg-dg-elevated rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-50"
          style={{
            width: `${pct}%`,
            background: dim
              ? "var(--color-dg-accent-60, var(--color-dg-accent))"
              : "var(--color-dg-accent)",
            opacity: dim ? 0.6 : 1,
          }}
        />
      </div>
      <span className="text-[0.7rem] text-dg-text-secondary tabular-nums shrink-0 font-mono">
        {watched}/{total}
      </span>
    </div>
  );
}

function EpisodeCounter({
  consecutiveEp,
  seasonEpCount,
  canDecrement,
  canIncrement,
  episodeDate,
  onIncrement,
  onDecrement,
  onDateChange,
}: {
  consecutiveEp: number;
  seasonEpCount: number;
  canDecrement: boolean;
  canIncrement: boolean;
  episodeDate: string;
  onIncrement: () => void;
  onDecrement: () => void;
  onDateChange: (date: string) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-3">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onDecrement}
          disabled={!canDecrement}
          className="w-9 h-9 flex items-center justify-center text-[1rem] bg-transparent border border-dg-border-subtle text-dg-text-secondary rounded-sm cursor-pointer transition-all duration-50 hover:border-dg-accent/40 hover:text-dg-accent disabled:opacity-30 disabled:cursor-default font-mono active:scale-[0.97] active:opacity-80"
        >
          -
        </button>
        <span className="text-[0.9rem] tabular-nums text-dg-text min-w-[5rem] text-center font-mono">
          {consecutiveEp} / {seasonEpCount}
        </span>
        <button
          type="button"
          onClick={onIncrement}
          disabled={!canIncrement}
          className="w-9 h-9 flex items-center justify-center text-[1rem] bg-transparent border border-dg-border-subtle text-dg-text-secondary rounded-sm cursor-pointer transition-all duration-50 hover:border-dg-accent/40 hover:text-dg-accent disabled:opacity-30 disabled:cursor-default font-mono active:scale-[0.97] active:opacity-80"
        >
          +
        </button>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-[0.65rem] text-dg-text-tertiary uppercase tracking-wider">
          Watched on
        </span>
        <input
          type="date"
          value={episodeDate}
          max={todayISO()}
          onChange={(e) => onDateChange(e.target.value || todayISO())}
          className="text-[0.75rem] font-mono bg-dg-bg border border-dg-border-subtle rounded-sm px-2 py-1 text-dg-text outline-none focus:border-dg-accent transition-colors"
        />
      </div>
    </div>
  );
}

export function EpisodeTracker({
  seasons,
  watchedEpisodes,
  onWatchedChange,
}: {
  seasons: Season[];
  watchedEpisodes?: WatchedEpisodes;
  onWatchedChange?: (w: WatchedEpisodes) => void;
}) {
  const interactive = !!onWatchedChange && !!watchedEpisodes;
  const isMultiSeason = seasons.length > 1;

  // Always-fresh ref so rapid clicks don't read stale prop values
  const latestWatchedRef = useRef(watchedEpisodes ?? {});
  useEffect(() => {
    latestWatchedRef.current = watchedEpisodes ?? {};
  }, [watchedEpisodes]);

  // Auto-select first incomplete season on mount
  const [selectedSeason, setSelectedSeason] = useState(() => {
    for (const s of seasons) {
      if (s.episodeCount == null) continue;
      const w = highestConsecutiveEpisode(watchedEpisodes, s.seasonNumber);
      if (w < s.episodeCount) return s.seasonNumber;
    }
    return seasons[0]?.seasonNumber ?? 1;
  });
  const [episodeDate, setEpisodeDate] = useState(todayISO());

  const currentSeason = seasons.find((s) => s.seasonNumber === selectedSeason) ?? seasons[0];
  const seasonEpCount = currentSeason?.episodeCount ?? 0;
  const seasonWatched = countSeasonWatched(watchedEpisodes, currentSeason?.seasonNumber ?? 0);
  const consecutiveEp = highestConsecutiveEpisode(
    watchedEpisodes,
    currentSeason?.seasonNumber ?? 0,
  );

  const totalEps = seasons.reduce((sum, s) => sum + (s.episodeCount ?? 0), 0);
  const totalWatched = countWatchedEpisodes(watchedEpisodes);

  // Cross-season navigation
  const idx = seasons.findIndex((s) => s.seasonNumber === currentSeason.seasonNumber);
  const nextSeason = isMultiSeason
    ? seasons.slice(idx + 1).find((s) => (s.episodeCount ?? 0) > 0)
    : undefined;
  const prevSeason = isMultiSeason
    ? seasons
        .slice(0, idx)
        .reverse()
        .find((s) => highestConsecutiveEpisode(watchedEpisodes, s.seasonNumber) > 0)
    : undefined;

  const handleIncrement = () => {
    const current = latestWatchedRef.current;
    if (consecutiveEp < seasonEpCount) {
      const next = markThroughEpisode(
        current,
        currentSeason.seasonNumber,
        consecutiveEp + 1,
        episodeDate,
      );
      latestWatchedRef.current = next;
      onWatchedChange?.(next);
    } else if (nextSeason) {
      const next = markThroughEpisode(current, nextSeason.seasonNumber, 1, episodeDate);
      latestWatchedRef.current = next;
      onWatchedChange?.(next);
      setSelectedSeason(nextSeason.seasonNumber);
    }
  };

  const handleDecrement = () => {
    const current = latestWatchedRef.current;
    if (consecutiveEp > 0) {
      const next = clearSeasonFrom(
        current,
        currentSeason.seasonNumber,
        consecutiveEp,
        seasonEpCount,
      );
      latestWatchedRef.current = next;
      onWatchedChange?.(next);
    } else if (prevSeason) {
      const pc = highestConsecutiveEpisode(current, prevSeason.seasonNumber);
      const next = clearSeasonFrom(
        current,
        prevSeason.seasonNumber,
        pc,
        prevSeason.episodeCount ?? 0,
      );
      latestWatchedRef.current = next;
      onWatchedChange?.(next);
      setSelectedSeason(prevSeason.seasonNumber);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[0.65rem] text-dg-text-tertiary uppercase tracking-wider m-0">
          Episodes
        </h3>
        {isMultiSeason && (
          <select
            value={selectedSeason}
            onChange={(e) => setSelectedSeason(Number(e.target.value))}
            className="text-[0.75rem] font-mono bg-dg-bg border border-dg-border-subtle rounded-sm px-2 py-1 text-dg-text outline-none focus:border-dg-accent transition-colors cursor-pointer max-w-[50%]"
          >
            {seasons.map((s) => (
              <option key={s.id} value={s.seasonNumber}>
                S{String(s.seasonNumber).padStart(2, "0")}
                {s.title ? ` \u2014 ${s.title}` : ""}
              </option>
            ))}
          </select>
        )}
      </div>

      {seasonEpCount > 0 && (
        <div className="mb-2">
          <SeasonProgressBar
            label={isMultiSeason ? `S${String(currentSeason.seasonNumber).padStart(2, "0")}` : "ep"}
            watched={seasonWatched}
            total={seasonEpCount}
          />
        </div>
      )}

      {isMultiSeason && totalEps > 0 && (
        <div className="mb-3">
          <SeasonProgressBar label="ALL" watched={totalWatched} total={totalEps} dim />
        </div>
      )}

      {interactive && seasonEpCount > 0 && (
        <EpisodeCounter
          consecutiveEp={consecutiveEp}
          seasonEpCount={seasonEpCount}
          canDecrement={consecutiveEp > 0 || !!prevSeason}
          canIncrement={consecutiveEp < seasonEpCount || !!nextSeason}
          episodeDate={episodeDate}
          onIncrement={handleIncrement}
          onDecrement={handleDecrement}
          onDateChange={setEpisodeDate}
        />
      )}

      {!interactive && seasons.length > 0 && (
        <div className="space-y-1.5 mt-2">
          {seasons.map((s) => {
            const w = countSeasonWatched(watchedEpisodes, s.seasonNumber);
            const epCount = s.episodeCount ?? 0;
            return (
              <div key={s.id} className="flex items-center gap-2">
                <span className="text-[0.65rem] text-dg-text-tertiary tabular-nums w-6 shrink-0 font-mono">
                  S{String(s.seasonNumber).padStart(2, "0")}
                </span>
                <div className="flex-1 h-[4px] bg-dg-elevated rounded-full overflow-hidden">
                  <div
                    className="h-full bg-dg-accent/40 rounded-full"
                    style={{
                      width: epCount > 0 ? `${Math.round((w / epCount) * 100)}%` : "0%",
                    }}
                  />
                </div>
                <span className="text-[0.6rem] text-dg-text-tertiary tabular-nums shrink-0 font-mono">
                  {epCount > 0 ? `${epCount} ep` : "?"}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

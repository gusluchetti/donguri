import { useCallback, useEffect, useRef, useState } from "react";
import {
  buildWatchLog,
  countSeasonWatched,
  countWatchedEpisodes,
  formatEpisodeRanges,
  getEpisodeDate,
  isEpisodeWatched,
  markEpisodeRange,
  nextUnwatchedEpisode,
  todayISO,
  toggleEpisode,
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

function CurrentProgress({
  watchedEpisodes,
  seasons,
}: {
  watchedEpisodes: WatchedEpisodes;
  seasons: Season[];
}) {
  const next = nextUnwatchedEpisode(watchedEpisodes, seasons);
  const totalWatched = countWatchedEpisodes(watchedEpisodes);
  if (totalWatched === 0) return null;

  return (
    <div className="text-[0.75rem] text-dg-text-secondary font-mono py-1.5">
      {next ? (
        <>
          Currently on:{" "}
          <span className="text-dg-accent">
            S{String(next.season).padStart(2, "0")}E{String(next.episode).padStart(2, "0")}
          </span>
        </>
      ) : (
        <span className="text-dg-stamped">All episodes watched</span>
      )}
    </div>
  );
}

function EpisodeGrid({
  seasonNumber,
  episodeCount,
  watchedEpisodes,
  episodeDate,
  onWatchedChange,
  latestWatchedRef,
}: {
  seasonNumber: number;
  episodeCount: number;
  watchedEpisodes: WatchedEpisodes;
  episodeDate: string;
  onWatchedChange: (w: WatchedEpisodes) => void;
  latestWatchedRef: React.RefObject<WatchedEpisodes>;
}) {
  const lastClickedRef = useRef<number | null>(null);
  const next = nextUnwatchedEpisode(watchedEpisodes, [{ seasonNumber, episodeCount }]);
  const nextEp = next?.season === seasonNumber ? next.episode : null;

  const handleClick = useCallback(
    (ep: number, shiftKey: boolean) => {
      const current = latestWatchedRef.current;
      let result: WatchedEpisodes;
      if (shiftKey && lastClickedRef.current != null) {
        // Shift+click: mark range from last-clicked to current
        result = markEpisodeRange(current, seasonNumber, lastClickedRef.current, ep, episodeDate);
      } else {
        result = toggleEpisode(current, seasonNumber, ep, episodeDate);
      }
      lastClickedRef.current = ep;
      latestWatchedRef.current = result;
      onWatchedChange(result);
    },
    [seasonNumber, episodeDate, onWatchedChange, latestWatchedRef],
  );

  return (
    <div
      className="grid gap-1 py-2"
      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(32px, 1fr))" }}
    >
      {Array.from({ length: episodeCount }, (_, i) => {
        const ep = i + 1;
        const watched = isEpisodeWatched(watchedEpisodes, seasonNumber, ep);
        const isNext = ep === nextEp;
        const date = getEpisodeDate(watchedEpisodes, seasonNumber, ep);

        return (
          <button
            key={ep}
            type="button"
            title={date ? `Watched ${date}` : `Episode ${ep}`}
            onClick={(e) => handleClick(ep, e.shiftKey)}
            className={`min-h-[40px] sm:min-h-[32px] flex items-center justify-center text-[0.7rem] font-mono rounded-sm cursor-pointer transition-all duration-50 active:scale-[0.95] ${
              watched
                ? "bg-dg-accent text-white border border-dg-accent"
                : isNext
                  ? "bg-transparent border-2 border-dg-accent text-dg-accent"
                  : "bg-transparent border border-dg-border-subtle text-dg-text-tertiary hover:border-dg-border hover:text-dg-text-secondary"
            }`}
          >
            {ep}
          </button>
        );
      })}
    </div>
  );
}

function formatLogDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function WatchLog({ watchedEpisodes }: { watchedEpisodes: WatchedEpisodes }) {
  const log = buildWatchLog(watchedEpisodes);
  if (log.length === 0) return null;

  return (
    <details className="mt-3">
      <summary className="text-[0.65rem] text-dg-text-tertiary uppercase tracking-wider cursor-pointer select-none hover:text-dg-text-secondary transition-colors">
        Watch log
      </summary>
      <div className="mt-2 ml-2 border-l-2 border-dg-border-subtle pl-3 space-y-1.5">
        {log.map((group) => (
          <div key={group.date} className="text-[0.7rem] font-mono leading-relaxed">
            <span className="text-dg-text-secondary">{formatLogDate(group.date)}</span>
            <span className="text-dg-text-tertiary"> &mdash; </span>
            <span className="text-dg-text">{formatEpisodeRanges(group.entries)}</span>
          </div>
        ))}
      </div>
    </details>
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
    const next = nextUnwatchedEpisode(watchedEpisodes, seasons);
    if (next) return next.season;
    return seasons[0]?.seasonNumber ?? 1;
  });
  const [episodeDate, setEpisodeDate] = useState(todayISO());

  const currentSeason = seasons.find((s) => s.seasonNumber === selectedSeason) ?? seasons[0];
  const seasonEpCount = currentSeason?.episodeCount ?? 0;
  const seasonWatched = countSeasonWatched(watchedEpisodes, currentSeason?.seasonNumber ?? 0);

  const totalEps = seasons.reduce((sum, s) => sum + (s.episodeCount ?? 0), 0);
  const totalWatched = countWatchedEpisodes(watchedEpisodes);

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
        <>
          <CurrentProgress watchedEpisodes={watchedEpisodes} seasons={seasons} />

          <EpisodeGrid
            seasonNumber={currentSeason.seasonNumber}
            episodeCount={seasonEpCount}
            watchedEpisodes={watchedEpisodes}
            episodeDate={episodeDate}
            onWatchedChange={onWatchedChange}
            latestWatchedRef={latestWatchedRef}
          />

          <div className="flex items-center gap-2 pt-2">
            <span className="text-[0.65rem] text-dg-text-tertiary uppercase tracking-wider">
              Watched on
            </span>
            <input
              type="date"
              value={episodeDate}
              max={todayISO()}
              onChange={(e) => setEpisodeDate(e.target.value || todayISO())}
              className="text-[0.75rem] font-mono bg-dg-bg border border-dg-border-subtle rounded-sm px-2 py-1 text-dg-text outline-none focus:border-dg-accent transition-colors"
            />
          </div>

          <WatchLog watchedEpisodes={watchedEpisodes} />
        </>
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

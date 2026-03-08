import { ArrowCounterClockwise } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
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

function vibrate(ms = 8) {
  navigator.vibrate?.(ms);
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${months[Number(m) - 1]} ${Number(d)}, ${y}`;
}

function SeriesBar({
  seasons,
  watched,
  activeSeason,
  onSeasonClick,
}: {
  seasons: Season[];
  watched: WatchedEpisodes | undefined;
  activeSeason: number;
  onSeasonClick?: (sn: number) => void;
}) {
  const totalEps = seasons.reduce((s, sn) => s + (sn.episodeCount ?? 0), 0);
  if (totalEps === 0 && seasons.every((s) => s.episodeCount == null)) return null;

  return (
    <div className="flex h-6 rounded-lg overflow-hidden bg-dg-elevated">
      {seasons.map((s, i) => {
        const epCount = s.episodeCount ?? 0;
        if (epCount === 0) return null;
        const w = countSeasonWatched(watched, s.seasonNumber);
        const pct = w / epCount;
        const isComplete = w >= epCount;
        const isActive = s.seasonNumber === activeSeason;
        const color = isComplete ? "var(--color-dg-tv)" : "var(--color-dg-accent)";
        const isLast = i === seasons.length - 1;

        return (
          <button
            type="button"
            key={s.id}
            className="h-full relative cursor-pointer border-none p-0 bg-transparent hover:brightness-110 flex items-center justify-center"
            style={{
              flex: epCount / totalEps,
              borderRight: isLast ? undefined : "1px solid var(--color-dg-border-subtle)",
            }}
            onClick={() => onSeasonClick?.(s.seasonNumber)}
            title={`S${String(s.seasonNumber).padStart(2, "0")} — ${w}/${epCount}`}
          >
            <div
              className="absolute inset-0 transition-all duration-150"
              style={{
                width: `${Math.round(pct * 100)}%`,
                background: color,
                opacity: isActive ? 1 : 0.5,
              }}
            />
            <span
              className="relative text-[0.6rem] font-mono tabular-nums leading-none transition-opacity duration-100"
              style={{ opacity: isActive ? 0.9 : 0.4 }}
            >
              S{String(s.seasonNumber).padStart(2, "0")}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function EpisodePopover({
  epNumber,
  date,
  seasonEpCount,
  onUnmarkSingle,
  onUnmarkToEnd,
  onClose,
}: {
  epNumber: number;
  date: string;
  seasonEpCount: number;
  onUnmarkSingle: () => void;
  onUnmarkToEnd: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute bottom-full left-1/2 mb-1.5 z-50 w-[180px] p-2.5 rounded border border-dg-border-subtle bg-dg-surface text-xs shadow-lg"
      style={{
        transform: "translateX(-50%)",
        animation: "popIn 120ms var(--ease-smooth) both",
      }}
    >
      <div className="text-dg-text-secondary mb-2 font-mono tabular-nums">
        ep {epNumber} &middot; {fmtDate(date)}
      </div>
      <button
        type="button"
        onClick={() => {
          vibrate();
          onUnmarkSingle();
          onClose();
        }}
        className="w-full text-left text-xs text-dg-anime bg-transparent border-none cursor-pointer p-0 hover:underline font-mono"
      >
        unmark ep {epNumber}
      </button>
      {epNumber < seasonEpCount && (
        <button
          type="button"
          onClick={() => {
            vibrate();
            onUnmarkToEnd();
            onClose();
          }}
          className="w-full text-left text-[0.7rem] text-dg-text-tertiary bg-transparent border-none cursor-pointer p-0 hover:underline font-mono mt-1.5"
        >
          unmark {epNumber}&rarr;{seasonEpCount}
        </button>
      )}
    </div>
  );
}

type CellState = "unwatched" | "watched" | "complete" | "next";

function cellStyles(state: CellState) {
  switch (state) {
    case "complete":
      return {
        bg: "color-mix(in srgb, var(--color-dg-tv) 20%, transparent)",
        borderColor: "color-mix(in srgb, var(--color-dg-tv) 40%, transparent)",
        textColor: "var(--color-dg-tv)",
      };
    case "watched":
      return {
        bg: "color-mix(in srgb, var(--color-dg-accent) 15%, transparent)",
        borderColor: "color-mix(in srgb, var(--color-dg-accent) 30%, transparent)",
        textColor: "var(--color-dg-accent)",
      };
    case "next":
      return {
        bg: "transparent",
        borderColor: "var(--color-dg-accent)",
        textColor: "var(--color-dg-accent)",
      };
    default:
      return {
        bg: "transparent",
        borderColor: "var(--color-dg-border-subtle)",
        textColor: "var(--color-dg-text-tertiary)",
      };
  }
}

function EpCell({
  epNumber,
  state,
  date,
  seasonEpCount,
  popoverOpen,
  onClickUnwatched,
  onClickWatched,
  onUnmarkSingle,
  onUnmarkToEnd,
  onClosePopover,
}: {
  epNumber: number;
  state: CellState;
  date?: string;
  seasonEpCount: number;
  popoverOpen: boolean;
  onClickUnwatched: () => void;
  onClickWatched: () => void;
  onUnmarkSingle: () => void;
  onUnmarkToEnd: () => void;
  onClosePopover: () => void;
}) {
  const isWatched = state === "watched" || state === "complete";
  const isNext = state === "next";
  const { bg, borderColor, textColor } = cellStyles(state);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          vibrate();
          if (isWatched) onClickWatched();
          else onClickUnwatched();
        }}
        className={`ep-cell ${isWatched ? "ep-stamped" : ""} w-full aspect-square flex items-center justify-center rounded border cursor-pointer font-mono text-xs sm:text-sm tabular-nums bg-transparent p-0`}
        style={{
          background: bg,
          borderColor,
          borderStyle: isNext ? "dashed" : "solid",
          color: textColor,
          animation: isNext ? "epGlow 2s ease-in-out infinite" : undefined,
        }}
      >
        {epNumber}
      </button>
      {popoverOpen && date && (
        <EpisodePopover
          epNumber={epNumber}
          date={date}
          seasonEpCount={seasonEpCount}
          onUnmarkSingle={onUnmarkSingle}
          onUnmarkToEnd={onUnmarkToEnd}
          onClose={onClosePopover}
        />
      )}
    </div>
  );
}

function EpisodeGrid({
  season,
  watched,
  episodeDate,
  popoverEp,
  onSetPopover,
  onMarkThrough,
  onUnmarkFrom,
}: {
  season: Season;
  watched: WatchedEpisodes | undefined;
  episodeDate: string;
  popoverEp: number | null;
  onSetPopover: (ep: number | null) => void;
  onMarkThrough: (season: number, ep: number, date: string) => void;
  onUnmarkFrom: (season: number, fromEp: number, toEp: number) => void;
}) {
  const epCount = season.episodeCount ?? 0;
  if (epCount === 0) {
    return (
      <div className="text-xs text-dg-text-tertiary font-body py-3 text-center">
        S{String(season.seasonNumber).padStart(2, "0")} — episode count unknown
      </div>
    );
  }

  const sn = season.seasonNumber;
  const seasonEps = watched?.[String(sn)] ?? {};
  const consecutive = highestConsecutiveEpisode(watched, sn);
  const seasonWatched = countSeasonWatched(watched, sn);
  const isComplete = seasonWatched >= epCount;

  const cells = Array.from({ length: epCount }, (_, i) => {
    const ep = i + 1;
    const date = seasonEps[String(ep)];
    const isMarked = !!date;
    let state: CellState;
    if (isMarked) {
      state = isComplete ? "complete" : "watched";
    } else if (ep === consecutive + 1) {
      state = "next";
    } else {
      state = "unwatched";
    }
    return { ep, state, date };
  });

  return (
    <div className="ep-grid">
      {cells.map(({ ep, state, date }) => (
        <EpCell
          key={ep}
          epNumber={ep}
          state={state}
          date={date}
          seasonEpCount={epCount}
          popoverOpen={popoverEp === ep}
          onClickUnwatched={() => onMarkThrough(sn, ep, episodeDate)}
          onClickWatched={() => onSetPopover(popoverEp === ep ? null : ep)}
          onUnmarkSingle={() => onUnmarkFrom(sn, ep, ep)}
          onUnmarkToEnd={() => onUnmarkFrom(sn, ep, epCount)}
          onClosePopover={() => onSetPopover(null)}
        />
      ))}
    </div>
  );
}

function SeasonCarousel({
  seasons,
  activeSeason,
  onSeasonChange,
  children,
}: {
  seasons: Season[];
  activeSeason: number;
  onSeasonChange: (sn: number) => void;
  children: React.ReactNode;
}) {
  const [slideDir, setSlideDir] = useState<"L" | "R" | null>(null);
  const touchStart = useRef<number | null>(null);

  const idx = seasons.findIndex((s) => s.seasonNumber === activeSeason);
  const canPrev = idx > 0;
  const canNext = idx < seasons.length - 1;

  const navigate = useCallback(
    (dir: "L" | "R") => {
      const target = dir === "L" ? seasons[idx + 1] : seasons[idx - 1];
      if (!target) return;
      setSlideDir(dir);
      onSeasonChange(target.seasonNumber);
      // Reset animation class after it plays
      setTimeout(() => setSlideDir(null), 200);
    },
    [seasons, idx, onSeasonChange],
  );

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStart.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStart.current == null) return;
    const dx = e.changedTouches[0].clientX - touchStart.current;
    touchStart.current = null;
    if (Math.abs(dx) < 40) return;
    if (dx < 0 && canNext) navigate("L");
    else if (dx > 0 && canPrev) navigate("R");
  };

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className="overflow-x-hidden overflow-y-visible"
    >
      <div
        style={{
          animation: slideDir ? `slide${slideDir} 180ms var(--ease-smooth) both` : undefined,
        }}
      >
        {children}
      </div>

      {seasons.length > 1 && (
        <div className="flex items-center justify-center gap-1.5 mt-2">
          {seasons.map((s) => {
            const isActive = s.seasonNumber === activeSeason;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  if (!isActive) {
                    setSlideDir(s.seasonNumber > activeSeason ? "L" : "R");
                    onSeasonChange(s.seasonNumber);
                    setTimeout(() => setSlideDir(null), 200);
                  }
                }}
                className={`rounded-full border-none p-0 cursor-pointer transition-all duration-150 ${isActive ? "h-2 w-5 flex items-center justify-center" : "w-2 h-2 hover:opacity-80"}`}
                style={{
                  background: isActive ? "var(--color-dg-accent)" : "var(--color-dg-border)",
                }}
                title={`Season ${s.seasonNumber}`}
              >
                {isActive && (
                  <span className="text-[0.5rem] font-mono text-dg-bg leading-none">
                    {s.seasonNumber}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

type UndoSnapshot = WatchedEpisodes;
const MAX_UNDO = 20;

function useUndo(current: WatchedEpisodes) {
  const stack = useRef<UndoSnapshot[]>([]);
  const [size, setSize] = useState(0);

  const push = useCallback(() => {
    stack.current = [...stack.current.slice(-(MAX_UNDO - 1)), structuredClone(current)];
    setSize(stack.current.length);
  }, [current]);

  const pop = useCallback((): UndoSnapshot | undefined => {
    const item = stack.current.pop();
    setSize(stack.current.length);
    return item;
  }, []);

  const canUndo = size > 0;

  return { push, pop, canUndo };
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

  // Auto-select first incomplete season
  const [activeSeason, setActiveSeason] = useState(() => {
    for (const s of seasons) {
      if (s.episodeCount == null) continue;
      const w = highestConsecutiveEpisode(watchedEpisodes, s.seasonNumber);
      if (w < s.episodeCount) return s.seasonNumber;
    }
    return seasons[0]?.seasonNumber ?? 1;
  });

  const today = todayISO();
  const [episodeDate, setEpisodeDate] = useState(today);
  const [popoverEp, setPopoverEp] = useState<number | null>(null);

  const currentSeason = seasons.find((s) => s.seasonNumber === activeSeason) ?? seasons[0];
  const totalEps = seasons.reduce((sum, s) => sum + (s.episodeCount ?? 0), 0);
  const totalWatched = countWatchedEpisodes(watchedEpisodes);
  const hasIncompleteData = seasons.some((s) => s.episodeCount == null);

  const undo = useUndo(latestWatchedRef.current);

  const handleMarkThrough = useCallback(
    (sn: number, ep: number, date: string) => {
      if (!onWatchedChange) return;
      const current = latestWatchedRef.current;
      undo.push();
      const next = markThroughEpisode(current, sn, ep, date);
      latestWatchedRef.current = next;
      onWatchedChange(next);
      setPopoverEp(null);
    },
    [onWatchedChange, undo],
  );

  const handleUnmarkFrom = useCallback(
    (sn: number, fromEp: number, toEp: number) => {
      if (!onWatchedChange) return;
      const current = latestWatchedRef.current;
      undo.push();
      const next = clearSeasonFrom(current, sn, fromEp, toEp);
      latestWatchedRef.current = next;
      onWatchedChange(next);
    },
    [onWatchedChange, undo],
  );

  const handleUndo = useCallback(() => {
    if (!onWatchedChange) return;
    const prev = undo.pop();
    if (prev) {
      latestWatchedRef.current = prev;
      onWatchedChange(prev);
      setPopoverEp(null);
    }
  }, [onWatchedChange, undo]);

  const handleSeasonChange = useCallback((sn: number) => {
    setActiveSeason(sn);
    setPopoverEp(null);
  }, []);

  if (!interactive) {
    return (
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs text-dg-text-tertiary uppercase tracking-wider m-0">Episodes</h3>
          {totalEps > 0 && (
            <span className="text-[0.7rem] text-dg-text-tertiary tabular-nums font-mono">
              {totalWatched}/{totalEps}
            </span>
          )}
        </div>

        {hasIncompleteData && (
          <div className="text-[0.65rem] text-dg-text-tertiary font-body mb-2">
            some season data is incomplete
          </div>
        )}

        {isMultiSeason && (
          <SeriesBar seasons={seasons} watched={watchedEpisodes} activeSeason={activeSeason} />
        )}

        <div className="space-y-1.5 mt-2">
          {seasons.map((s) => {
            const w = countSeasonWatched(watchedEpisodes, s.seasonNumber);
            const epCount = s.episodeCount ?? 0;
            return (
              <div key={s.id} className="flex items-center gap-2">
                <span className="text-[0.7rem] text-dg-text-tertiary tabular-nums w-6 shrink-0 font-mono">
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
                <span className="text-[0.7rem] text-dg-text-tertiary tabular-nums shrink-0 font-mono">
                  {epCount > 0 ? `${epCount} ep` : "?"}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const seasonWatched = countSeasonWatched(watchedEpisodes, currentSeason.seasonNumber);
  const seasonEpCount = currentSeason.episodeCount ?? 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs text-dg-text-tertiary uppercase tracking-wider m-0">Episodes</h3>
        <span className="text-xs text-dg-text-secondary tabular-nums font-mono">
          {seasonWatched}/{seasonEpCount}
          {isMultiSeason && (
            <span className="text-dg-text-tertiary ml-1.5">
              ({totalWatched}/{totalEps})
            </span>
          )}
        </span>
      </div>

      {hasIncompleteData && (
        <div className="text-[0.65rem] text-dg-text-tertiary font-body mb-2">
          some season data is incomplete
        </div>
      )}

      {isMultiSeason && (
        <div className="mb-3">
          <SeriesBar
            seasons={seasons}
            watched={watchedEpisodes}
            activeSeason={activeSeason}
            onSeasonClick={handleSeasonChange}
          />
          {currentSeason.title && (
            <div className="text-xs text-dg-text-muted font-mono mt-1.5">{currentSeason.title}</div>
          )}
        </div>
      )}

      {(() => {
        const grid = (
          <EpisodeGrid
            season={currentSeason}
            watched={watchedEpisodes}
            episodeDate={episodeDate}
            popoverEp={popoverEp}
            onSetPopover={setPopoverEp}
            onMarkThrough={handleMarkThrough}
            onUnmarkFrom={handleUnmarkFrom}
          />
        );
        return isMultiSeason ? (
          <SeasonCarousel
            seasons={seasons}
            activeSeason={activeSeason}
            onSeasonChange={handleSeasonChange}
          >
            {grid}
          </SeasonCarousel>
        ) : (
          grid
        );
      })()}

      <div className="flex items-center gap-2 mt-3 border-t border-dg-border-subtle/50 pt-2">
        <input
          type="date"
          value={episodeDate}
          max={today}
          onChange={(e) => setEpisodeDate(e.target.value || today)}
          className="text-xs font-mono bg-dg-bg border border-dg-border-subtle rounded-sm px-2 py-1.5 text-dg-text outline-none focus:border-dg-accent transition-colors"
        />
        <button
          type="button"
          onClick={() => setEpisodeDate(today)}
          className={`dg-press text-xs font-mono border rounded-sm px-2 py-1.5 ${
            episodeDate === today
              ? "border-dg-border-subtle text-dg-text-tertiary bg-transparent opacity-40"
              : "border-dg-accent/30 text-dg-accent bg-transparent hover:bg-dg-accent/5"
          }`}
          disabled={episodeDate === today}
        >
          today
        </button>

        <div className="flex-1" />

        <button
          type="button"
          onClick={handleUndo}
          disabled={!undo.canUndo}
          className="text-dg-text-tertiary bg-transparent border-none cursor-pointer p-1 disabled:opacity-20 disabled:cursor-default hover:text-dg-text-secondary transition-colors"
          title="Undo last action"
        >
          <ArrowCounterClockwise size={16} />
        </button>
      </div>
    </div>
  );
}

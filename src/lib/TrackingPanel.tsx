import type { Hotkey } from "@tanstack/hotkeys";
import { useHotkey } from "@tanstack/react-hotkeys";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CatalogEntry } from "../db/schema";
import { getCatalogEntry, removeCatalogEntry, setCatalogEntry } from "./catalog.functions";
import {
  availableStatuses,
  clearSeasonFrom,
  countSeasonWatched,
  countWatchedEpisodes,
  highestConsecutiveEpisode,
  markThroughEpisode,
  ratingColor,
  replayCountLabel,
  statusLabel,
  todayISO,
  type WatchedEpisodes,
} from "./media-types";
import { catalogEntryOptions } from "./query-options";
import { RotaryKnob } from "./RotaryKnob";
import styles from "./TrackingPanel.module.css";
import { useAction } from "./use-action";

export function EpisodeTracker({
  seasons,
  watchedEpisodes,
  onWatchedChange,
}: {
  seasons: {
    id: string;
    seasonNumber: number;
    episodeCount: number | null;
    title: string | null;
    dataSource: string;
  }[];
  watchedEpisodes?: WatchedEpisodes;
  onWatchedChange?: (w: WatchedEpisodes) => void;
}) {
  const interactive = !!onWatchedChange && !!watchedEpisodes;
  const isMultiSeason = seasons.length > 1;

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
  const seasonPct = seasonEpCount > 0 ? Math.round((seasonWatched / seasonEpCount) * 100) : 0;

  const totalEps = seasons.reduce((sum, s) => sum + (s.episodeCount ?? 0), 0);
  const totalWatched = countWatchedEpisodes(watchedEpisodes);
  const totalPct = totalEps > 0 ? Math.round((totalWatched / totalEps) * 100) : 0;

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
    if (consecutiveEp < seasonEpCount) {
      onWatchedChange?.(
        markThroughEpisode(
          watchedEpisodes,
          currentSeason.seasonNumber,
          consecutiveEp + 1,
          episodeDate,
        ),
      );
    } else if (nextSeason) {
      onWatchedChange?.(
        markThroughEpisode(watchedEpisodes, nextSeason.seasonNumber, 1, episodeDate),
      );
      setSelectedSeason(nextSeason.seasonNumber);
    }
  };

  const handleDecrement = () => {
    if (consecutiveEp >= 1) {
      onWatchedChange?.(
        clearSeasonFrom(watchedEpisodes, currentSeason.seasonNumber, consecutiveEp, consecutiveEp),
      );
    } else if (prevSeason) {
      const pc = highestConsecutiveEpisode(watchedEpisodes, prevSeason.seasonNumber);
      if (pc > 0) {
        onWatchedChange?.(clearSeasonFrom(watchedEpisodes, prevSeason.seasonNumber, pc, pc));
      }
      setSelectedSeason(prevSeason.seasonNumber);
    }
  };

  return (
    <div>
      <div className={styles.episodesHeader}>
        <h3 className={styles.episodesLabel}>Episodes</h3>
        {isMultiSeason && (
          <select
            value={selectedSeason}
            onChange={(e) => setSelectedSeason(Number(e.target.value))}
            className={styles.seasonSelect}
          >
            {seasons.map((s) => (
              <option key={s.id} value={s.seasonNumber}>
                S{String(s.seasonNumber).padStart(2, "0")}
                {s.title ? ` — ${s.title}` : ""}
              </option>
            ))}
          </select>
        )}
      </div>

      {seasonEpCount > 0 && (
        <div className={styles.progressRow}>
          {isMultiSeason && (
            <span className={styles.progressLabel}>
              S{String(currentSeason.seasonNumber).padStart(2, "0")}
            </span>
          )}
          <div className={styles.progressTrack}>
            <div className={styles.progressFill} style={{ width: `${seasonPct}%` }} />
          </div>
          <span className={styles.progressCount}>
            {seasonWatched}/{seasonEpCount}
          </span>
        </div>
      )}

      {isMultiSeason && totalEps > 0 && (
        <div className={styles.progressSection}>
          <div className={styles.progressRow}>
            <span className={styles.progressLabel}>ALL</span>
            <div className={styles.progressTrack}>
              <div className={styles.progressFillDim} style={{ width: `${totalPct}%` }} />
            </div>
            <span className={styles.progressCount}>
              {totalWatched}/{totalEps}
            </span>
          </div>
        </div>
      )}

      {interactive && seasonEpCount > 0 && (
        <div className={styles.counterControls}>
          <div className={styles.counterRow}>
            <button
              type="button"
              onClick={handleDecrement}
              disabled={consecutiveEp <= 0 && !prevSeason}
              className={styles.counterBtn}
            >
              -
            </button>
            <span className={styles.counterDisplay}>
              {consecutiveEp} / {seasonEpCount}
            </span>
            <button
              type="button"
              onClick={handleIncrement}
              disabled={consecutiveEp >= seasonEpCount && !nextSeason}
              className={styles.counterBtn}
            >
              +
            </button>
          </div>

          <div className={styles.dateRow}>
            <span className={styles.dateLabelSmall}>Watched on</span>
            <input
              type="date"
              value={episodeDate}
              max={todayISO()}
              onChange={(e) => setEpisodeDate(e.target.value || todayISO())}
              className={styles.dateInputSmall}
            />
          </div>
        </div>
      )}

      {!interactive && seasons.length > 0 && (
        <div className={styles.readOnlySeasons}>
          {seasons.map((s) => {
            const w = countSeasonWatched(watchedEpisodes, s.seasonNumber);
            const epCount = s.episodeCount ?? 0;
            const pct = epCount > 0 ? Math.round((w / epCount) * 100) : 0;
            return (
              <div key={s.id} className={styles.readOnlyRow}>
                <span className={styles.readOnlyLabel}>
                  S{String(s.seasonNumber).padStart(2, "0")}
                </span>
                <div className={styles.readOnlyTrack}>
                  <div className={styles.readOnlyFill} style={{ width: `${pct}%` }} />
                </div>
                <span className={styles.readOnlyCount}>{epCount > 0 ? `${epCount} ep` : "?"}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function TrackingPanel({
  wikidataId,
  mediaType,
  initialEntry,
  statusState,
  favoriteState,
  watchedEpisodesState,
  watchedAtState,
  isMovie,
  bare,
  children,
}: {
  wikidataId: string;
  mediaType?: string;
  initialEntry?: CatalogEntry | null;
  statusState?: { value: string | null; set: (v: string | null) => void };
  favoriteState?: { value: boolean; set: (v: boolean) => void };
  watchedEpisodesState?: { value: WatchedEpisodes; set: (v: WatchedEpisodes) => void };
  watchedAtState?: { value: string | null; set: (v: string | null) => void };
  isMovie?: boolean;
  bare?: boolean;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const hasInitial = initialEntry !== undefined;
  const [entry, setEntry] = useState<CatalogEntry | null>(hasInitial ? initialEntry : null);
  const [loaded, setLoaded] = useState(hasInitial);
  const action = useAction();
  const cardRef = useRef<HTMLDivElement>(null);
  const [localRating, setLocalRating] = useState<number | null>(
    hasInitial ? (initialEntry?.rating ?? null) : null,
  );
  const [fallbackStatus, setFallbackStatus] = useState<string | null>(
    hasInitial ? (initialEntry?.status ?? null) : null,
  );
  const localStatus = statusState ? statusState.value : fallbackStatus;
  const setLocalStatus = statusState ? statusState.set : setFallbackStatus;
  const [fallbackFav, setFallbackFav] = useState(
    hasInitial ? (initialEntry?.isFavorite ?? false) : false,
  );
  const localIsFavorite = favoriteState ? favoriteState.value : fallbackFav;
  const setLocalIsFavorite = favoriteState ? favoriteState.set : setFallbackFav;
  const [localReplayCount, setLocalReplayCount] = useState(
    hasInitial ? (initialEntry?.replayCount ?? 0) : 0,
  );
  const serverEntry = useRef<CatalogEntry | null>(hasInitial ? (initialEntry ?? null) : null);

  const localWatchedEpisodes = watchedEpisodesState?.value ?? {};
  const setLocalWatchedEpisodes = watchedEpisodesState?.set;
  const localWatchedAt = watchedAtState?.value ?? null;
  const setLocalWatchedAt = watchedAtState?.set;

  const entryQuery = useQuery({
    ...catalogEntryOptions(wikidataId),
    enabled: !hasInitial,
  });

  useEffect(() => {
    if (hasInitial || entryQuery.isPending) return;
    const e = entryQuery.data ?? null;
    setEntry(e);
    setLocalRating(e?.rating ?? null);
    setLocalStatus(e?.status ?? null);
    setLocalIsFavorite(e?.isFavorite ?? false);
    setLocalReplayCount(e?.replayCount ?? 0);
    setLocalWatchedEpisodes?.((e?.watchedEpisodes as WatchedEpisodes) ?? {});
    setLocalWatchedAt?.(e?.watchedAt ?? null);
    serverEntry.current = e;
    setLoaded(true);
  }, [
    hasInitial,
    entryQuery.isPending,
    entryQuery.data,
    setLocalIsFavorite,
    setLocalStatus,
    setLocalWatchedEpisodes,
    setLocalWatchedAt,
  ]);

  const ratingDirty = localRating !== (serverEntry.current?.rating ?? null);
  const statusDirty = localStatus !== (serverEntry.current?.status ?? null);
  const favoriteDirty = localIsFavorite !== (serverEntry.current?.isFavorite ?? false);
  const replayDirty = localReplayCount !== (serverEntry.current?.replayCount ?? 0);
  const episodesDirty =
    JSON.stringify(localWatchedEpisodes) !==
    JSON.stringify((serverEntry.current?.watchedEpisodes as WatchedEpisodes) ?? {});
  const watchedAtDirty = localWatchedAt !== (serverEntry.current?.watchedAt ?? null);
  const isDirty =
    ratingDirty || statusDirty || favoriteDirty || replayDirty || episodesDirty || watchedAtDirty;

  const handleSave = useCallback(async () => {
    const status = localStatus as NonNullable<CatalogEntry["status"]>;
    if (!status) return;
    console.debug("[tracking] save %s → status=%s rating=%s", wikidataId, status, localRating);
    const prev = entry;
    setEntry((e) =>
      e
        ? {
            ...e,
            status,
            rating: localRating,
            isFavorite: localIsFavorite,
            replayCount: localReplayCount,
            updatedAt: new Date(),
          }
        : ({
            id: "",
            userId: "",
            mediaWikidataId: wikidataId,
            mediaTitle: null,
            mediaType: null,
            status,
            rating: localRating,
            note: null,
            episodeProgress: null,
            isFavorite: localIsFavorite,
            replayCount: localReplayCount,
            completedAt: null,
            watchedEpisodes: null,
            rkey: null,
            syncedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          } as CatalogEntry),
    );
    await action.run(async () => {
      try {
        const hasWatchedEps = Object.keys(localWatchedEpisodes).length > 0;
        await setCatalogEntry({
          data: {
            wikidataId,
            status,
            rating: localRating,
            note: prev?.note,
            episodeProgress: prev?.episodeProgress,
            isFavorite: localIsFavorite,
            replayCount: localReplayCount,
            watchedEpisodes: hasWatchedEps ? localWatchedEpisodes : undefined,
            watchedAt: localWatchedAt,
          },
        });
        console.debug("[tracking] save %s → server ok, refreshing", wikidataId);
        const fresh = await getCatalogEntry({ data: { wikidataId } });
        setEntry(fresh);
        setLocalRating(fresh?.rating ?? null);
        setLocalStatus(fresh?.status ?? null);
        setLocalIsFavorite(fresh?.isFavorite ?? false);
        setLocalReplayCount(fresh?.replayCount ?? 0);
        setLocalWatchedEpisodes?.((fresh?.watchedEpisodes as WatchedEpisodes) ?? {});
        setLocalWatchedAt?.(fresh?.watchedAt ?? null);
        serverEntry.current = fresh;
        queryClient.invalidateQueries({ queryKey: ["user"] });
        router.invalidate();
        // Save pulse animation
        const card = cardRef.current?.closest(`.${styles.trackingCard}`) as HTMLElement | null;
        if (card) {
          card.removeAttribute("data-save-pulse");
          void card.offsetWidth;
          card.setAttribute("data-save-pulse", "");
          setTimeout(() => card.removeAttribute("data-save-pulse"), 900);
        }
      } catch (err) {
        console.error("[tracking] save %s → FAILED:", wikidataId, err);
        setEntry(prev);
        setLocalRating(prev?.rating ?? null);
        setLocalStatus(prev?.status ?? null);
        setLocalIsFavorite(prev?.isFavorite ?? false);
        setLocalReplayCount(prev?.replayCount ?? 0);
        setLocalWatchedEpisodes?.((prev?.watchedEpisodes as WatchedEpisodes) ?? {});
        setLocalWatchedAt?.(prev?.watchedAt ?? null);
        // Error pulse animation
        const card = cardRef.current?.closest(`.${styles.trackingCard}`) as HTMLElement | null;
        if (card) {
          card.removeAttribute("data-save-error");
          void card.offsetWidth;
          card.setAttribute("data-save-error", "");
          setTimeout(() => card.removeAttribute("data-save-error"), 900);
        }
        throw err;
      }
    });
  }, [
    entry,
    localStatus,
    localRating,
    localIsFavorite,
    localReplayCount,
    localWatchedEpisodes,
    localWatchedAt,
    wikidataId,
    router,
    queryClient,
    action,
    setLocalIsFavorite,
    setLocalStatus,
    setLocalWatchedEpisodes,
    setLocalWatchedAt,
  ]);

  // ─── Auto-save: 1s debounce ────────────────────────────────────────────
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;

  // biome-ignore lint/correctness/useExhaustiveDependencies: extra deps intentionally trigger debounce reset on value changes
  useEffect(() => {
    if (!isDirty || !localStatus || action.state === "pending") {
      clearTimeout(autoSaveTimer.current);
      return;
    }
    autoSaveTimer.current = setTimeout(() => {
      if (isDirtyRef.current) {
        handleSaveRef.current();
      }
    }, 1000);
    return () => clearTimeout(autoSaveTimer.current);
  }, [
    isDirty,
    localStatus,
    action.state,
    localRating,
    localIsFavorite,
    localReplayCount,
    localWatchedEpisodes,
    localWatchedAt,
  ]);

  // Flush pending save on navigation / page close
  useEffect(() => {
    const flush = () => {
      if (isDirtyRef.current && autoSaveTimer.current) {
        clearTimeout(autoSaveTimer.current);
        handleSaveRef.current();
      }
    };
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      flush();
    };
  }, []);

  const handleRemove = useCallback(async () => {
    console.debug("[tracking] remove %s", wikidataId);
    await action.run(async () => {
      await removeCatalogEntry({ data: { wikidataId } });
      console.debug("[tracking] remove %s → server ok, reloading", wikidataId);
      window.location.reload();
    });
  }, [wikidataId, action]);

  const statuses = availableStatuses(mediaType);

  const notBusy = action.state !== "pending";

  const statusKeyMap: Record<string, string> = {
    P: "planned",
    W: "in_progress",
    O: "on_hold",
    C: "completed",
    D: "dropped",
    M: "mastered",
  };
  for (const [key, status] of Object.entries(statusKeyMap)) {
    // biome-ignore lint/correctness/useHookAtTopLevel: static iteration over constant map
    useHotkey(key as Hotkey, () => setLocalStatus(status), {
      enabled: loaded && notBusy && statusLabel(status as never, mediaType) !== null,
    });
  }

  const [ratingMode, setRatingMode] = useState(false);
  const ratingBuf = useRef("");

  useHotkey("=", () => setRatingMode(true), {
    enabled: loaded && notBusy && !!localStatus && !ratingMode,
  });

  useEffect(() => {
    if (!ratingMode) return;
    ratingBuf.current = "";

    const commit = () => {
      const val = Number.parseInt(ratingBuf.current, 10);
      if (!Number.isNaN(val) && val >= 0 && val <= 100) {
        setLocalRating(val);
      }
      ratingBuf.current = "";
      setRatingMode(false);
    };

    const cancel = () => {
      ratingBuf.current = "";
      setRatingMode(false);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancel();
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        commit();
        return;
      }
      if (e.key >= "0" && e.key <= "9") {
        e.preventDefault();
        ratingBuf.current += e.key;
        const val = Number.parseInt(ratingBuf.current, 10);
        if (ratingBuf.current.length >= 3 || (ratingBuf.current.length === 2 && val > 10)) {
          commit();
        }
        return;
      }
      cancel();
    };

    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [ratingMode]);

  useHotkey(
    "S",
    () => {
      if (isDirty) {
        clearTimeout(autoSaveTimer.current);
        handleSave();
      }
    },
    { enabled: loaded && notBusy && isDirty },
  );

  useHotkey(
    "Shift+D",
    () => {
      if (serverEntry.current?.status) handleRemove();
    },
    { enabled: loaded && notBusy && !!serverEntry.current?.status },
  );

  if (!loaded) {
    return (
      <div ref={cardRef} className={bare ? styles.trackingInner : styles.trackingCard}>
        <div
          className={`dg-skeleton ${styles.skeleton}`}
          style={{ width: "5rem", height: "0.75rem" }}
        />
      </div>
    );
  }

  const saveState =
    action.state === "pending"
      ? "pending"
      : action.state === "error"
        ? "error"
        : isDirty
          ? "dirty"
          : "clean";

  return (
    <div ref={cardRef} className={bare ? styles.trackingInner : styles.trackingCard}>
      <div className={styles.trackingHeader}>
        <h3 className={styles.trackingLabel}>Status</h3>
        {localStatus && (
          <button
            type="button"
            onClick={() => setLocalIsFavorite(!localIsFavorite)}
            className={styles.favBtn}
            {...(localIsFavorite ? { "data-active": "" } : {})}
            title={localIsFavorite ? "Remove from favorites" : "Mark as favorite"}
          >
            {localIsFavorite ? "\u2605" : "\u2606"}
          </button>
        )}
      </div>

      <div className={styles.statusRow}>
        {statuses.map((s) => {
          const isActive = localStatus === s;
          const label = statusLabel(s, mediaType);
          return (
            <button
              key={s}
              type="button"
              onClick={() => setLocalStatus(s)}
              disabled={action.state === "pending"}
              className={styles.statusBtn}
              data-status={s}
              {...(isActive ? { "data-active": "" } : {})}
            >
              {label}
            </button>
          );
        })}
      </div>

      {(localStatus === "in_progress" ||
        localStatus === "completed" ||
        localStatus === "mastered") && (
        <div className={styles.ratingSection}>
          <h4 className={styles.ratingLabel}>
            Rating
            {ratingMode && (
              <span className={styles.ratingMode}>
                = <span className="dg-breathe">_</span>
              </span>
            )}
          </h4>
          <div className={styles.ratingControls}>
            <div className={styles.knobWrapper}>
              <RotaryKnob
                value={localRating ?? 0}
                onChange={(v) => setLocalRating(v || null)}
                size={80}
                color={ratingColor(localRating) ?? "var(--dg-accent)"}
                disabled={action.state === "pending"}
              />
              <RatingInput
                value={localRating}
                onChange={setLocalRating}
                disabled={action.state === "pending"}
              />
            </div>
            {localRating != null && (
              <button
                type="button"
                onClick={() => setLocalRating(null)}
                disabled={action.state === "pending"}
                className={styles.ratingClearBtn}
                title="Clear rating"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      )}

      {(localStatus === "completed" || localStatus === "mastered") && (
        <div className={styles.replayRow}>
          <button
            type="button"
            onClick={() => setLocalReplayCount(Math.max(0, localReplayCount - 1))}
            disabled={action.state === "pending" || localReplayCount <= 0}
            className={styles.replayBtn}
          >
            -
          </button>
          <span className={styles.replayLabel}>
            {replayCountLabel(localReplayCount, mediaType) ?? "First time"}
          </span>
          <button
            type="button"
            onClick={() => setLocalReplayCount(localReplayCount + 1)}
            disabled={action.state === "pending"}
            className={styles.replayBtn}
          >
            +
          </button>
        </div>
      )}

      {isMovie && localStatus && setLocalWatchedAt && (
        <div className={styles.dateSection}>
          <h4 className={styles.dateLabel}>Watched on</h4>
          <input
            type="date"
            value={localWatchedAt ?? ""}
            max={todayISO()}
            onChange={(e) => setLocalWatchedAt(e.target.value || null)}
            disabled={action.state === "pending"}
            className={styles.dateInput}
          />
        </div>
      )}

      {children && <div className={styles.childrenSlot}>{children}</div>}

      {localStatus && (
        <div className={styles.bottomBar}>
          <button
            type="button"
            onClick={() => {
              clearTimeout(autoSaveTimer.current);
              handleSave();
            }}
            disabled={action.state === "pending" || !isDirty}
            className={styles.saveBtn}
            data-state={saveState}
            title="Save changes"
          >
            {action.state === "pending" ? (
              <span className="dg-ellipsis">saving</span>
            ) : action.state === "done" ? (
              "saved"
            ) : action.state === "error" ? (
              "error \u2014 retry"
            ) : isDirty ? (
              "save"
            ) : (
              "saved"
            )}
          </button>
          {serverEntry.current?.status && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={action.state === "pending"}
              className={styles.deleteBtn}
              title="Remove from list"
            >
              delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function RatingInput({
  value,
  onChange,
  disabled,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  disabled: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const color = ratingColor(value) ?? "var(--dg-accent)";

  const startEditing = () => {
    if (disabled) return;
    setText(value != null ? String(value) : "");
    setEditing(true);
    queueMicrotask(() => inputRef.current?.select());
  };

  const commit = () => {
    setEditing(false);
    const trimmed = text.trim();
    if (trimmed === "") {
      onChange(null);
      return;
    }
    const parsed = Number.parseInt(trimmed, 10);
    if (Number.isNaN(parsed)) return;
    onChange(Math.min(100, Math.max(0, parsed)));
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        value={text}
        maxLength={3}
        onChange={(e) => {
          if (/^\d{0,3}$/.test(e.target.value)) setText(e.target.value);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
        }}
        className={styles.ratingInputEditing}
        style={{ color, borderColor: color }}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={startEditing}
      disabled={disabled}
      className={styles.ratingInputDisplay}
      style={{ color, textDecorationColor: `${color}50` }}
      title="Click to type a rating"
    >
      {value != null ? value : "\u2014"}
    </button>
  );
}

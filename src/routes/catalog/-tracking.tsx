import { Star, X } from "@phosphor-icons/react";
import type { Hotkey } from "@tanstack/hotkeys";
import { useHotkey } from "@tanstack/react-hotkeys";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CatalogEntry } from "~/db/schema";
import {
  getCatalogEntry,
  removeCatalogEntry,
  setCatalogEntry,
} from "~/features/catalog/catalog.functions";
import { catalogEntryOptions } from "~/features/catalog/catalog.queries";
import { SoundEngine } from "~/features/catalog/catalog.sound";
import {
  availableStatuses,
  ratingColor,
  replayCountLabel,
  STATUS_BUTTON_COLORS,
  type StatusValue,
  statusLabel,
  todayISO,
  type WatchedEpisodes,
} from "~/features/media/media-types";
import { useAction } from "~/hooks/use-action";

type StatePair<T> = { value: T; set: (v: T) => void };

export type TrackingPanelProps = {
  wikidataId: string;
  mediaType?: string;
  initialEntry?: CatalogEntry | null;
  statusState?: StatePair<string | null>;
  favoriteState?: StatePair<boolean>;
  watchedEpisodesState?: StatePair<WatchedEpisodes>;
  watchedAtState?: StatePair<string | null>;
  isMovie?: boolean;
  bare?: boolean;
  children?: React.ReactNode;
};

function useRatingKeyboard(
  ratingMode: boolean,
  setRatingMode: (v: boolean) => void,
  setLocalRating: (v: number | null) => void,
) {
  useEffect(() => {
    if (!ratingMode) return;

    const buf = { current: "" };

    const commit = () => {
      const val = Number.parseInt(buf.current, 10);
      if (!Number.isNaN(val) && val >= 0 && val <= 100) setLocalRating(val);
      buf.current = "";
      setRatingMode(false);
    };

    const cancel = () => {
      buf.current = "";
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
        buf.current += e.key;
        const val = Number.parseInt(buf.current, 10);
        // Auto-commit: 3 digits, or 2 digits where a 3rd can't stay ≤100
        if (buf.current.length >= 3 || (buf.current.length === 2 && val > 10)) commit();
        return;
      }
      cancel();
    };

    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [ratingMode, setRatingMode, setLocalRating]);
}

type TrackingShortcutArgs = {
  loaded: boolean;
  notBusy: boolean;
  mediaType: string | undefined;
  localStatus: string | null;
  isDirty: boolean;
  ratingMode: boolean;
  hasServerEntry: boolean;
  setLocalStatus: (v: string | null) => void;
  setRatingMode: (v: boolean) => void;
  handleSave: () => void;
  handleRemove: () => void;
};

function useTrackingShortcuts({
  loaded,
  notBusy,
  mediaType,
  localStatus,
  isDirty,
  ratingMode,
  hasServerEntry,
  setLocalStatus,
  setRatingMode,
  handleSave,
  handleRemove,
}: TrackingShortcutArgs) {
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

  useHotkey("=", () => setRatingMode(true), {
    enabled: loaded && notBusy && !!localStatus && !ratingMode,
  });

  useHotkey("S", handleSave, { enabled: loaded && notBusy && isDirty });

  useHotkey("Shift+D", handleRemove, {
    enabled: loaded && notBusy && hasServerEntry,
  });
}

type StatusButtonsProps = {
  statuses: StatusValue[];
  localStatus: string | null;
  statusAnimating: boolean;
  isPending: boolean;
  mediaType?: string;
  onStatusChange: (s: string) => void;
};

function StatusButtons({
  statuses,
  localStatus,
  statusAnimating,
  isPending,
  mediaType,
  onStatusChange,
}: StatusButtonsProps) {
  return (
    <div className="flex flex-nowrap overflow-x-auto sm:flex-wrap gap-1.5 mb-4 scrollbar-hide">
      {statuses.map((s) => {
        const isActive = localStatus === s;
        const colorClass = STATUS_BUTTON_COLORS[s];
        const label = statusLabel(s, mediaType);
        return (
          <button
            key={s}
            type="button"
            onClick={() => onStatusChange(s)}
            disabled={isPending}
            className={`text-[0.8rem] py-2 sm:py-1.5 px-3 min-h-[44px] sm:min-h-0 rounded-sm border font-body cursor-pointer shrink-0 transition-all duration-150 disabled:opacity-50 active:scale-[0.97] active:opacity-80 ${
              isActive
                ? colorClass
                : "border-dg-border-subtle text-dg-text-secondary bg-transparent hover:border-dg-border"
            }`}
            style={{
              animation:
                isActive && statusAnimating ? "stampDown 300ms var(--ease-smooth) both" : "none",
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

type RatingSectionProps = {
  localRating: number | null;
  isPending: boolean;
  ratingMode: boolean;
  onChange: (v: number | null) => void;
};

function RatingSection({ localRating, isPending, ratingMode, onChange }: RatingSectionProps) {
  return (
    <div className="mb-4">
      <h4 className="text-[0.65rem] text-dg-text-tertiary uppercase tracking-wider mb-2">
        Rating
        {ratingMode && (
          <span className="ml-2 text-dg-accent normal-case tracking-normal">
            = <span className="animate-pulse">_</span>
          </span>
        )}
      </h4>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          value={localRating ?? 0}
          onChange={(e) => onChange(Number.parseInt(e.target.value, 10) || null)}
          disabled={isPending}
          className="dg-range flex-1"
          style={{ "--rating-color": ratingColor(localRating) } as React.CSSProperties}
        />
        <RatingInput value={localRating} onChange={onChange} disabled={isPending} />
        {localRating != null && (
          <button
            type="button"
            onClick={() => onChange(null)}
            disabled={isPending}
            className="text-dg-text-tertiary bg-transparent border-none cursor-pointer p-2 -m-2 hover:text-dg-anime transition-colors duration-150 disabled:opacity-50"
            title="Clear rating"
          >
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

type ReplaySectionProps = {
  localReplayCount: number;
  isPending: boolean;
  mediaType?: string;
  onChange: (count: number) => void;
};

function ReplaySection({ localReplayCount, isPending, mediaType, onChange }: ReplaySectionProps) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <button
        type="button"
        onClick={() => onChange(Math.max(0, localReplayCount - 1))}
        disabled={isPending || localReplayCount <= 0}
        className="text-[0.8rem] bg-transparent border border-dg-border-subtle text-dg-text-secondary rounded-sm w-7 h-7 flex items-center justify-center cursor-pointer disabled:opacity-30 active:scale-[0.97] active:opacity-80"
      >
        -
      </button>
      <span className="text-[0.75rem] text-dg-text-secondary min-w-[5rem] text-center">
        {replayCountLabel(localReplayCount, mediaType) ?? "First time"}
      </span>
      <button
        type="button"
        onClick={() => onChange(localReplayCount + 1)}
        disabled={isPending}
        className="text-[0.8rem] bg-transparent border border-dg-border-subtle text-dg-text-secondary rounded-sm w-7 h-7 flex items-center justify-center cursor-pointer disabled:opacity-30 active:scale-[0.97] active:opacity-80"
      >
        +
      </button>
    </div>
  );
}

type WatchedAtSectionProps = {
  localWatchedAt: string | null;
  isPending: boolean;
  onChange: (v: string | null) => void;
};

function WatchedAtSection({ localWatchedAt, isPending, onChange }: WatchedAtSectionProps) {
  return (
    <div className="mb-4">
      <h4 className="text-[0.65rem] text-dg-text-tertiary uppercase tracking-wider mb-2">
        Watched on
      </h4>
      <input
        type="date"
        value={localWatchedAt ?? ""}
        max={todayISO()}
        onChange={(e) => onChange(e.target.value || null)}
        disabled={isPending}
        className="text-[0.8rem] font-mono bg-dg-bg border border-dg-border-subtle rounded-sm px-2 py-1.5 text-dg-text outline-none focus:border-dg-accent transition-colors disabled:opacity-50"
      />
    </div>
  );
}

type TrackingSaveBarProps = {
  isDirty: boolean;
  hasServerEntry: boolean;
  actionState: "idle" | "pending" | "done" | "error";
  onSave: () => void;
  onRemove: () => void;
};

function TrackingSaveBar({
  isDirty,
  hasServerEntry,
  actionState,
  onSave,
  onRemove,
}: TrackingSaveBarProps) {
  const saveLabel = (() => {
    if (actionState === "pending") return <span className="dg-ellipsis">saving</span>;
    if (actionState === "done") return "saved";
    if (actionState === "error") return "error \u2014 retry";
    return isDirty ? "save" : "saved";
  })();

  return (
    <div className="flex items-center justify-between pt-3 mt-4 border-t border-dg-border-subtle">
      <button
        type="button"
        onClick={onSave}
        disabled={actionState === "pending" || !isDirty}
        className={`text-[0.75rem] font-body rounded-sm border px-3 py-1 bg-transparent cursor-pointer transition-all duration-150 disabled:cursor-default active:scale-[0.97] active:opacity-80 ${
          actionState === "pending"
            ? "border-dg-accent/50 text-dg-accent/70"
            : actionState === "error"
              ? "border-dg-anime/40 text-dg-anime"
              : isDirty
                ? "border-dg-accent text-dg-accent bg-dg-accent/10"
                : "border-dg-border-subtle text-dg-text-tertiary opacity-50"
        }`}
        title="Save changes"
      >
        {saveLabel}
      </button>
      {hasServerEntry && (
        <button
          type="button"
          onClick={onRemove}
          disabled={actionState === "pending"}
          className="text-[0.75rem] font-body rounded-sm border border-dg-border-subtle text-dg-text-tertiary bg-transparent px-3 py-1 cursor-pointer transition-all duration-150 hover:text-dg-anime hover:border-dg-anime/40 disabled:opacity-50 disabled:cursor-default active:scale-[0.97] active:opacity-80"
          title="Remove from list"
        >
          delete
        </button>
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
  const color = ratingColor(value) ?? "var(--color-dg-accent)";

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
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
          if (/^\d{0,3}$/.test(e.target.value)) setText(e.target.value);
        }}
        onBlur={commit}
        onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
        }}
        className="w-[4ch] text-[0.85rem] tabular-nums text-right bg-dg-bg border border-dg-border rounded-sm px-1 py-0 font-mono outline-none shrink-0"
        style={{ color, borderColor: color }}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={startEditing}
      disabled={disabled}
      className="text-[0.85rem] tabular-nums w-[4ch] text-right bg-transparent border-none font-mono cursor-text p-0 shrink-0 hover:underline disabled:cursor-default disabled:no-underline"
      style={{ color, textDecorationColor: `${color}50` }}
      title="Click to type a rating"
    >
      {value != null ? value : "\u2014"}
    </button>
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
}: TrackingPanelProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const hasInitial = initialEntry !== undefined;
  const action = useAction();

  const [entry, setEntry] = useState<CatalogEntry | null>(hasInitial ? initialEntry : null);
  const [loaded, setLoaded] = useState(hasInitial);
  const [localRating, setLocalRating] = useState<number | null>(
    hasInitial ? (initialEntry?.rating ?? null) : null,
  );
  const [fallbackStatus, setFallbackStatus] = useState<string | null>(
    hasInitial ? (initialEntry?.status ?? null) : null,
  );
  const [fallbackFav, setFallbackFav] = useState(
    hasInitial ? (initialEntry?.isFavorite ?? false) : false,
  );
  const [localReplayCount, setLocalReplayCount] = useState(
    hasInitial ? (initialEntry?.replayCount ?? 0) : 0,
  );
  const serverEntry = useRef<CatalogEntry | null>(hasInitial ? (initialEntry ?? null) : null);

  // Controlled vs uncontrolled pattern for states owned by parent (MediaDetailPage)
  const localStatus = statusState ? statusState.value : fallbackStatus;
  const setLocalStatus = statusState ? statusState.set : setFallbackStatus;
  const localIsFavorite = favoriteState ? favoriteState.value : fallbackFav;
  const setLocalIsFavorite = favoriteState ? favoriteState.set : setFallbackFav;
  const localWatchedEpisodes = watchedEpisodesState?.value ?? {};
  const setLocalWatchedEpisodes = watchedEpisodesState?.set;
  const localWatchedAt = watchedAtState?.value ?? null;
  const setLocalWatchedAt = watchedAtState?.set;

  const prevStatusRef = useRef(localStatus);
  const [statusAnimating, setStatusAnimating] = useState(false);

  useEffect(() => {
    if (localStatus !== prevStatusRef.current && prevStatusRef.current !== null) {
      SoundEngine.stamp();
      setStatusAnimating(true);
      const t = setTimeout(() => setStatusAnimating(false), 350);
      prevStatusRef.current = localStatus;
      return () => clearTimeout(t);
    }
    prevStatusRef.current = localStatus;
  }, [localStatus]);

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

  const isDirty =
    localRating !== (serverEntry.current?.rating ?? null) ||
    localStatus !== (serverEntry.current?.status ?? null) ||
    localIsFavorite !== (serverEntry.current?.isFavorite ?? false) ||
    localReplayCount !== (serverEntry.current?.replayCount ?? 0) ||
    JSON.stringify(localWatchedEpisodes) !==
      JSON.stringify((serverEntry.current?.watchedEpisodes as WatchedEpisodes) ?? {}) ||
    localWatchedAt !== (serverEntry.current?.watchedAt ?? null);

  const handleSave = useCallback(async () => {
    const status = localStatus as NonNullable<CatalogEntry["status"]>;
    if (!status) return;
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
      } catch (err) {
        // Rollback optimistic update on failure
        setEntry(prev);
        setLocalRating(prev?.rating ?? null);
        setLocalStatus(prev?.status ?? null);
        setLocalIsFavorite(prev?.isFavorite ?? false);
        setLocalReplayCount(prev?.replayCount ?? 0);
        setLocalWatchedEpisodes?.((prev?.watchedEpisodes as WatchedEpisodes) ?? {});
        setLocalWatchedAt?.(prev?.watchedAt ?? null);
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

  const handleRemove = useCallback(async () => {
    await action.run(async () => {
      await removeCatalogEntry({ data: { wikidataId } });
      window.location.reload();
    });
  }, [wikidataId, action]);

  const [ratingMode, setRatingMode] = useState(false);
  const notBusy = action.state !== "pending";

  useRatingKeyboard(ratingMode, setRatingMode, setLocalRating);
  useTrackingShortcuts({
    loaded,
    notBusy,
    mediaType,
    localStatus,
    isDirty,
    ratingMode,
    hasServerEntry: !!serverEntry.current?.status,
    setLocalStatus,
    setRatingMode,
    handleSave,
    handleRemove,
  });

  const statuses = availableStatuses(mediaType);
  const isPending = action.state === "pending";
  const wrapperClass = bare
    ? "p-3 sm:p-4"
    : "border border-dg-border-subtle rounded p-3 sm:p-4 bg-dg-surface mb-4 sm:mb-5";

  if (!loaded) {
    return (
      <div className={wrapperClass}>
        <div className="w-20 h-3 bg-dg-elevated rounded animate-pulse" />
      </div>
    );
  }

  const showRating =
    localStatus === "in_progress" || localStatus === "completed" || localStatus === "mastered";
  const showReplay = localStatus === "completed" || localStatus === "mastered";

  return (
    <div className={wrapperClass}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[0.7rem] text-dg-text-tertiary uppercase tracking-wider m-0">Status</h3>
        {localStatus && (
          <button
            type="button"
            onClick={() => setLocalIsFavorite(!localIsFavorite)}
            className={`flex items-center bg-transparent border-none cursor-pointer p-1 -m-1 transition-colors duration-150 active:scale-[0.97] active:opacity-80 ${
              localIsFavorite ? "text-dg-accent" : "text-dg-text-tertiary hover:text-dg-accent/60"
            }`}
            title={localIsFavorite ? "Remove from favorites" : "Mark as favorite"}
          >
            <Star size={16} weight={localIsFavorite ? "fill" : "regular"} />
          </button>
        )}
      </div>

      <StatusButtons
        statuses={statuses}
        localStatus={localStatus}
        statusAnimating={statusAnimating}
        isPending={isPending}
        mediaType={mediaType}
        onStatusChange={setLocalStatus}
      />

      {showRating && (
        <RatingSection
          localRating={localRating}
          isPending={isPending}
          ratingMode={ratingMode}
          onChange={setLocalRating}
        />
      )}

      {showReplay && (
        <ReplaySection
          localReplayCount={localReplayCount}
          isPending={isPending}
          mediaType={mediaType}
          onChange={setLocalReplayCount}
        />
      )}

      {isMovie && localStatus && setLocalWatchedAt && (
        <WatchedAtSection
          localWatchedAt={localWatchedAt}
          isPending={isPending}
          onChange={setLocalWatchedAt}
        />
      )}

      {children && <div className="mt-5">{children}</div>}

      {localStatus && (
        <TrackingSaveBar
          isDirty={isDirty}
          hasServerEntry={!!serverEntry.current?.status}
          actionState={action.state}
          onSave={handleSave}
          onRemove={handleRemove}
        />
      )}
    </div>
  );
}

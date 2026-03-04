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
  replayCountState?: StatePair<number>;
  watchedEpisodesState?: StatePair<WatchedEpisodes>;
  watchedAtState?: StatePair<string | null>;
  onRewatch?: () => void;
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
  localReplayCount: number;
  statusAnimating: boolean;
  isPending: boolean;
  mediaType?: string;
  onStatusChange: (s: string) => void;
};

function StatusButtons({
  statuses,
  localStatus,
  localReplayCount,
  statusAnimating,
  isPending,
  mediaType,
  onStatusChange,
}: StatusButtonsProps) {
  return (
    <div className="flex flex-nowrap overflow-x-auto sm:flex-wrap gap-1.5 scrollbar-hide">
      {statuses.map((s) => {
        const isActive = localStatus === s;
        const colorClass = STATUS_BUTTON_COLORS[s];
        const label = statusLabel(s, mediaType);
        const showBadge = s === "completed" && localReplayCount > 0;
        return (
          <button
            key={s}
            type="button"
            onClick={() => onStatusChange(s)}
            disabled={isPending}
            className={`relative text-[0.8rem] py-2 sm:py-1.5 px-3 min-h-[44px] sm:min-h-0 rounded-sm border font-body cursor-pointer shrink-0 transition-all duration-50 disabled:opacity-50 active:scale-[0.97] active:opacity-80 ${
              isActive
                ? colorClass
                : "border-dg-border-subtle text-dg-text-secondary bg-transparent hover:border-dg-border"
            }`}
            style={{
              animation:
                isActive && statusAnimating ? "stampDown 50ms var(--ease-smooth) both" : "none",
            }}
          >
            {label}
            {showBadge && (
              <span className="absolute -top-1.5 -right-1.5 text-[0.55rem] font-mono bg-dg-stamped text-dg-bg px-1 py-px rounded-full leading-none">
                &times;{localReplayCount + 1}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── Rating Knob ──────────────────────────────────────────────────────────────

const KNOB_SIZE = 72;
const KNOB_STROKE = 5;
const KNOB_R = (KNOB_SIZE - KNOB_STROKE) / 2;
const ARC_START = 135; // 7 o'clock
const ARC_SWEEP = 270; // total sweep

function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const x1 = cx + r * Math.cos(toRad(startDeg));
  const y1 = cy + r * Math.sin(toRad(startDeg));
  const x2 = cx + r * Math.cos(toRad(endDeg));
  const y2 = cy + r * Math.sin(toRad(endDeg));
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
}

// Full 270° arc path — rendered once, clipped via stroke-dasharray
const FULL_ARC = arcPath(KNOB_SIZE / 2, KNOB_SIZE / 2, KNOB_R, ARC_START, ARC_START + ARC_SWEEP);
const ARC_LENGTH = (ARC_SWEEP / 360) * 2 * Math.PI * KNOB_R;

function angleToValue(angleDeg: number): number {
  let rel = angleDeg - ARC_START;
  if (rel < 0) rel += 360;
  if (rel > ARC_SWEEP) {
    return rel > ARC_SWEEP + (360 - ARC_SWEEP) / 2 ? 0 : 100;
  }
  return Math.round((rel / ARC_SWEEP) * 100);
}

type RatingKnobProps = {
  value: number | null;
  isPending: boolean;
  ratingMode: boolean;
  onChange: (v: number | null) => void;
};

function RatingKnob({ value, isPending, ratingMode, onChange }: RatingKnobProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);
  const lastTick = useRef<number>(-1);
  const dragStartX = useRef(0);
  const dragStartValue = useRef(0);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const editRef = useRef<HTMLInputElement>(null);

  const color = ratingColor(value) ?? "var(--color-dg-text-tertiary)";
  const valueFrac = (value ?? 0) / 100;
  const dashVisible = valueFrac * ARC_LENGTH;
  const dashHidden = ARC_LENGTH - dashVisible;

  const getAngle = (e: { clientX: number; clientY: number }) => {
    const svg = svgRef.current;
    if (!svg) return 0;
    const rect = svg.getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    let deg = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (deg < 0) deg += 360;
    return deg;
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (isPending || editing) return;
    e.preventDefault();
    dragging.current = true;
    lastTick.current = -1;
    dragStartX.current = e.clientX;
    dragStartValue.current = value ?? 0;
    (e.target as Element).setPointerCapture(e.pointerId);

    if (e.pointerType === "touch") {
      const angle = getAngle(e);
      const v = angleToValue(angle);
      onChange(v);
      checkTick(v);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;

    if (e.pointerType === "touch") {
      const angle = getAngle(e);
      const v = angleToValue(angle);
      onChange(v);
      checkTick(v);
    } else {
      const dx = e.clientX - dragStartX.current;
      const v = Math.round(Math.min(100, Math.max(0, dragStartValue.current + dx / 2)));
      onChange(v);
      checkTick(v);
    }
  };

  const handlePointerUp = () => {
    dragging.current = false;
  };

  const checkTick = (v: number) => {
    const tick = Math.floor(v / 5);
    if (tick !== lastTick.current) {
      lastTick.current = tick;
      navigator.vibrate?.(4);
    }
  };

  const startEditing = () => {
    if (isPending) return;
    setEditText(value != null ? String(value) : "");
    setEditing(true);
    queueMicrotask(() => editRef.current?.select());
  };

  const commitEdit = () => {
    setEditing(false);
    const trimmed = editText.trim();
    if (trimmed === "") {
      onChange(null);
      return;
    }
    const parsed = Number.parseInt(trimmed, 10);
    if (Number.isNaN(parsed)) return;
    onChange(Math.min(100, Math.max(0, parsed)));
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isPending && value != null) {
      onChange(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (isPending) return;
    const step = e.shiftKey ? 10 : 1;
    if (e.key === "ArrowUp" || e.key === "ArrowRight") {
      e.preventDefault();
      onChange(Math.min(100, (value ?? 0) + step));
    } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
      e.preventDefault();
      onChange(Math.max(0, (value ?? 0) - step));
    }
  };

  const glowColor = value != null ? color : "transparent";

  return (
    <div className="relative flex flex-col items-center gap-1">
      <h4 className="text-[0.65rem] text-dg-text-tertiary uppercase tracking-wider">
        Rating
        {ratingMode && (
          <span className="ml-2 text-dg-accent normal-case tracking-normal">
            = <span className="animate-pulse">_</span>
          </span>
        )}
      </h4>
      <div
        role="slider"
        tabIndex={0}
        aria-valuenow={value ?? undefined}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Rating"
        className="outline-none"
        onKeyDown={handleKeyDown}
      >
        <svg
          ref={svgRef}
          width={KNOB_SIZE}
          height={KNOB_SIZE}
          className="block cursor-pointer knob-drag"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          style={{
            filter: value != null ? `drop-shadow(0 0 6px ${glowColor})` : undefined,
            touchAction: "none",
          }}
        >
          <title>Rating: {value ?? "not set"}</title>
          {/* Background arc */}
          <path
            d={FULL_ARC}
            fill="none"
            stroke="var(--color-dg-elevated)"
            strokeWidth={KNOB_STROKE}
            strokeLinecap="round"
          />
          {/* Value arc — stroke-dasharray for smooth CSS transitions */}
          <path
            d={FULL_ARC}
            fill="none"
            stroke={value != null && value > 0 ? color : "transparent"}
            strokeWidth={KNOB_STROKE}
            strokeLinecap="round"
            strokeDasharray={`${dashVisible} ${dashHidden}`}
            style={{
              transition: "stroke-dasharray 150ms ease-out, stroke 150ms ease-out",
            }}
          />
        </svg>
      </div>
      {/* Center label — positioned over the SVG */}
      <div
        className="absolute flex items-center justify-center"
        style={{
          top: `calc(${KNOB_SIZE / 2}px + 0.65rem + 0.5rem)`,
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: KNOB_SIZE * 0.55,
          height: KNOB_SIZE * 0.55,
        }}
      >
        {editing ? (
          <input
            ref={editRef}
            type="text"
            inputMode="numeric"
            value={editText}
            maxLength={3}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              if (/^\d{0,3}$/.test(e.target.value)) setEditText(e.target.value);
            }}
            onBlur={commitEdit}
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
              if (e.key === "Enter") commitEdit();
              if (e.key === "Escape") setEditing(false);
            }}
            className="w-full text-center text-[0.85rem] tabular-nums bg-dg-bg border border-dg-border rounded-sm px-1 py-0 font-mono outline-none"
            style={{ color, borderColor: color }}
          />
        ) : (
          <button
            type="button"
            onClick={startEditing}
            onDoubleClick={handleDoubleClick}
            disabled={isPending}
            className="text-[0.95rem] tabular-nums font-mono bg-transparent border-none cursor-pointer p-0 transition-colors duration-50 hover:brightness-125 disabled:cursor-default"
            style={{ color }}
            title="Click to type, double-click to clear"
          >
            {value != null ? value : "\u2014"}
          </button>
        )}
      </div>
      {/* Clear button on hover */}
      {value != null && !editing && (
        <button
          type="button"
          onClick={() => onChange(null)}
          disabled={isPending}
          className="absolute -top-0.5 -right-0.5 text-dg-text-tertiary bg-dg-surface border border-dg-border-subtle rounded-full w-4 h-4 flex items-center justify-center cursor-pointer opacity-0 hover:opacity-100 transition-opacity duration-100 disabled:hidden"
          style={{ fontSize: "0.55rem" }}
          title="Clear rating"
        >
          <X size={8} />
        </button>
      )}
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
        className={`text-[0.75rem] font-body rounded-sm border px-3 py-1 bg-transparent cursor-pointer transition-all duration-50 disabled:cursor-default active:scale-[0.97] active:opacity-80 ${
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
          className="text-[0.75rem] font-body rounded-sm border border-dg-border-subtle text-dg-text-tertiary bg-transparent px-3 py-1 cursor-pointer transition-all duration-50 hover:text-dg-anime hover:border-dg-anime/40 disabled:opacity-50 disabled:cursor-default active:scale-[0.97] active:opacity-80"
          title="Remove from list"
        >
          delete
        </button>
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
  replayCountState,
  watchedEpisodesState,
  watchedAtState,
  onRewatch,
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
  const [fallbackReplayCount, setFallbackReplayCount] = useState(
    hasInitial ? (initialEntry?.replayCount ?? 0) : 0,
  );
  const serverEntry = useRef<CatalogEntry | null>(hasInitial ? (initialEntry ?? null) : null);

  const localStatus = statusState ? statusState.value : fallbackStatus;
  const setLocalStatus = statusState ? statusState.set : setFallbackStatus;
  const localIsFavorite = favoriteState ? favoriteState.value : fallbackFav;
  const setLocalIsFavorite = favoriteState ? favoriteState.set : setFallbackFav;
  const localReplayCount = replayCountState ? replayCountState.value : fallbackReplayCount;
  const setLocalReplayCount = replayCountState ? replayCountState.set : setFallbackReplayCount;
  const localWatchedEpisodes = watchedEpisodesState?.value ?? {};
  const setLocalWatchedEpisodes = watchedEpisodesState?.set;
  const localWatchedAt = watchedAtState?.value ?? null;
  const setLocalWatchedAt = watchedAtState?.set;

  const syncFromEntry = useCallback(
    (e: CatalogEntry | null) => {
      setLocalRating(e?.rating ?? null);
      setLocalStatus(e?.status ?? null);
      setLocalIsFavorite(e?.isFavorite ?? false);
      setLocalReplayCount(e?.replayCount ?? 0);
      setLocalWatchedEpisodes?.((e?.watchedEpisodes as WatchedEpisodes) ?? {});
      setLocalWatchedAt?.(e?.watchedAt ?? null);
    },
    [
      setLocalStatus,
      setLocalIsFavorite,
      setLocalReplayCount,
      setLocalWatchedEpisodes,
      setLocalWatchedAt,
    ],
  );

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
    syncFromEntry(e);
    serverEntry.current = e;
    setLoaded(true);
  }, [hasInitial, entryQuery.isPending, entryQuery.data, syncFromEntry]);

  const isDirty =
    localRating !== (serverEntry.current?.rating ?? null) ||
    localStatus !== (serverEntry.current?.status ?? null) ||
    localIsFavorite !== (serverEntry.current?.isFavorite ?? false) ||
    localReplayCount !== (serverEntry.current?.replayCount ?? 0) ||
    JSON.stringify(localWatchedEpisodes) !==
      JSON.stringify((serverEntry.current?.watchedEpisodes as WatchedEpisodes) ?? {}) ||
    localWatchedAt !== (serverEntry.current?.watchedAt ?? null);

  const handleSaveRef = useRef<(() => void) | undefined>(undefined);

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
        syncFromEntry(fresh);
        serverEntry.current = fresh;
        queryClient.invalidateQueries({ queryKey: ["user"] });
        router.invalidate();
      } catch (err) {
        setEntry(prev);
        syncFromEntry(prev);
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
    syncFromEntry,
  ]);

  handleSaveRef.current = handleSave;

  // Autosave: debounce 300ms when watched episodes change
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // biome-ignore lint/correctness/useExhaustiveDependencies: deliberately fire only on watched episodes change
  useEffect(() => {
    if (!localStatus) return;
    const watchedChanged =
      JSON.stringify(localWatchedEpisodes) !==
      JSON.stringify((serverEntry.current?.watchedEpisodes as WatchedEpisodes) ?? {});
    if (!watchedChanged) return;
    clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      handleSaveRef.current?.();
    }, 300);
    return () => clearTimeout(autoSaveTimer.current);
  }, [localWatchedEpisodes]);

  async function handleRemove() {
    await action.run(async () => {
      await removeCatalogEntry({ data: { wikidataId } });
      window.location.reload();
    });
  }

  // Status change handler: click completed when already completed → rewatch
  const handleStatusChange = useCallback(
    (s: string) => {
      if (s === "completed" && localStatus === "completed") {
        setLocalReplayCount(localReplayCount + 1);
        onRewatch?.();
        setLocalStatus("in_progress");
        SoundEngine.stamp();
        navigator.vibrate?.(12);
      } else {
        setLocalStatus(s);
      }
    },
    [localStatus, localReplayCount, setLocalStatus, setLocalReplayCount, onRewatch],
  );

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

  return (
    <div className={wrapperClass}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[0.7rem] text-dg-text-tertiary uppercase tracking-wider m-0">Status</h3>
        {localStatus && (
          <button
            type="button"
            onClick={() => setLocalIsFavorite(!localIsFavorite)}
            className={`flex items-center bg-transparent border-none cursor-pointer p-1 -m-1 transition-colors duration-50 active:scale-[0.97] active:opacity-80 ${
              localIsFavorite ? "text-dg-accent" : "text-dg-text-tertiary hover:text-dg-accent/60"
            }`}
            title={localIsFavorite ? "Remove from favorites" : "Mark as favorite"}
          >
            <Star size={16} weight={localIsFavorite ? "fill" : "regular"} />
          </button>
        )}
      </div>

      {/* Two-column desktop: status left, knob right */}
      <div className="flex flex-col sm:flex-row sm:gap-4">
        <div className="flex-1 min-w-0">
          <StatusButtons
            statuses={statuses}
            localStatus={localStatus}
            localReplayCount={localReplayCount}
            statusAnimating={statusAnimating}
            isPending={isPending}
            mediaType={mediaType}
            onStatusChange={handleStatusChange}
          />
        </div>
        {showRating && (
          <div className="shrink-0 flex items-center justify-center mt-3 sm:mt-0">
            <RatingKnob
              value={localRating}
              isPending={isPending}
              ratingMode={ratingMode}
              onChange={setLocalRating}
            />
          </div>
        )}
      </div>

      {isMovie && localStatus && setLocalWatchedAt && (
        <div className="mt-4">
          <WatchedAtSection
            localWatchedAt={localWatchedAt}
            isPending={isPending}
            onChange={setLocalWatchedAt}
          />
        </div>
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

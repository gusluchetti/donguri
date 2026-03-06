import { Check, Compass, Pause, Play, Seal, Star, X } from "@phosphor-icons/react";
import type { Hotkey } from "@tanstack/hotkeys";
import { useHotkey } from "@tanstack/react-hotkeys";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "~/components/Button";
import { Spinner } from "~/components/Spinner";
import type { CatalogEntry } from "~/db/schema";
import { getCatalogEntry, setCatalogEntry } from "~/features/catalog/catalog.functions";
import { useRemoveCatalogEntry } from "~/features/catalog/catalog.mutations";
import { catalogEntryOptions } from "~/features/catalog/catalog.queries";
import { SoundEngine } from "~/features/catalog/catalog.sound";
import {
  availableStatuses,
  ratingColor,
  replayCountLabel,
  STATUS_ACCENT,
  STATUS_BUTTON_COLORS,
  STATUS_BUTTON_INACTIVE,
  type StatusValue,
  statusLabel,
  todayISO,
  type WatchedEpisodes,
} from "~/features/media/media-types";
import { useAction } from "~/hooks/use-action";
import { cn } from "~/lib/cn";

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

const STATUS_ICONS: Record<
  StatusValue,
  React.ComponentType<{ size: number; className: string }>
> = {
  planned: Compass,
  in_progress: Play,
  on_hold: Pause,
  completed: Check,
  mastered: Seal,
  dropped: X,
};

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
    <div className="flex flex-wrap gap-1.5">
      {statuses.map((s) => {
        const isActive = localStatus === s;
        const colorClass = STATUS_BUTTON_COLORS[s];
        const label = statusLabel(s, mediaType);
        const showBadge = s === "completed" && localReplayCount > 0;
        const Icon = STATUS_ICONS[s];
        return (
          <button
            key={s}
            type="button"
            onClick={() => onStatusChange(s)}
            disabled={isPending}
            className={cn(
              "dg-press relative flex items-center justify-center gap-1 text-[0.8rem] py-2 sm:py-1.5 px-3 min-h-[44px] sm:min-h-0 rounded-sm border font-body flex-1 min-w-fit",
              isActive
                ? colorClass
                : `${STATUS_BUTTON_INACTIVE[s]} text-dg-text-secondary bg-transparent hover:brightness-110`,
            )}
            style={{
              animation:
                isActive && statusAnimating ? "stampDown 50ms var(--ease-smooth) both" : "none",
            }}
          >
            <Icon
              size={15}
              className={isActive ? "opacity-70" : `opacity-30 ${STATUS_ACCENT[s]}`}
            />
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

const KNOB_STROKE = 6;
const ARC_START = 135;
const ARC_SWEEP = 270;

function knobGeometry(size: number) {
  const r = (size - KNOB_STROKE) / 2;
  const fullArc = arcPath(size / 2, size / 2, r, ARC_START, ARC_START + ARC_SWEEP);
  const arcLength = (ARC_SWEEP / 360) * 2 * Math.PI * r;
  return { r, fullArc, arcLength };
}

function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const x1 = cx + r * Math.cos(toRad(startDeg));
  const y1 = cy + r * Math.sin(toRad(startDeg));
  const x2 = cx + r * Math.cos(toRad(endDeg));
  const y2 = cy + r * Math.sin(toRad(endDeg));
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
}

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
  size?: number;
};

// Pixels of horizontal drag to traverse 0–100
const DRAG_RANGE_PX = 400;

function RatingKnob({ value, isPending, ratingMode, onChange, size = 100 }: RatingKnobProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartValue = useRef(0);
  const lastValue = useRef<number>(-1);
  const [isDragging, setIsDragging] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const editRef = useRef<HTMLInputElement>(null);

  const { r, fullArc, arcLength } = useMemo(() => knobGeometry(size), [size]);

  const color = ratingColor(value) ?? "var(--color-dg-text-tertiary)";
  const valueFrac = (value ?? 0) / 100;
  const dashVisible = valueFrac * arcLength;
  const dashHidden = arcLength - dashVisible;

  const thumbAngleRad = ((ARC_START + ARC_SWEEP * valueFrac) * Math.PI) / 180;
  const thumbX = size / 2 + r * Math.cos(thumbAngleRad);
  const thumbY = size / 2 + r * Math.sin(thumbAngleRad);

  const isTouch = useRef(false);

  const getAngle = (e: { clientX: number; clientY: number }) => {
    const svg = svgRef.current;
    if (!svg) return 0;
    const rect = svg.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let deg = (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI;
    if (deg < 0) deg += 360;
    return deg;
  };

  const tick = useCallback((v: number) => {
    if (v !== lastValue.current) {
      lastValue.current = v;
      navigator.vibrate?.(3);
      SoundEngine.knobTick();
    }
  }, []);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (isPending || editing) return;
    e.preventDefault();
    dragging.current = true;
    isTouch.current = e.pointerType === "touch";
    dragStartX.current = e.clientX;
    dragStartValue.current = value ?? 0;
    lastValue.current = -1;
    setIsDragging(true);
    svgRef.current?.setPointerCapture(e.pointerId);

    if (isTouch.current) {
      const v = angleToValue(getAngle(e));
      onChange(v);
      tick(v);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    if (isTouch.current) {
      const v = angleToValue(getAngle(e));
      onChange(v);
      tick(v);
    } else {
      const dx = e.clientX - dragStartX.current;
      const v = Math.round(
        Math.min(100, Math.max(0, dragStartValue.current + (dx / DRAG_RANGE_PX) * 100)),
      );
      onChange(v);
      tick(v);
    }
  };

  const handlePointerUp = () => {
    dragging.current = false;
    setIsDragging(false);
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (isPending) return;
    const step = e.shiftKey ? 10 : 1;
    if (e.key === "ArrowUp" || e.key === "ArrowRight") {
      e.preventDefault();
      const next = Math.min(100, (value ?? 0) + step);
      onChange(next);
      tick(next);
    } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
      e.preventDefault();
      const next = Math.max(0, (value ?? 0) - step);
      onChange(next);
      tick(next);
    }
  };

  const svgFull = size;

  // Disable transitions while dragging for immediate response
  const arcTransition = isDragging
    ? "none"
    : "stroke-dasharray 150ms ease-out, stroke 150ms ease-out";
  const thumbTransition = isDragging
    ? "fill 150ms ease-out"
    : "cx 150ms ease-out, cy 150ms ease-out, fill 150ms ease-out";

  const cx = size / 2;
  const cy = size / 2;

  return (
    <div className="relative flex flex-col items-center">
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
          width={svgFull}
          height={svgFull}
          viewBox={`0 0 ${svgFull} ${svgFull}`}
          className="block cursor-pointer knob-drag"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          style={{ touchAction: "none", overflow: "visible" }}
        >
          <title>Rating: {value ?? "not set"}</title>
          <path
            d={fullArc}
            fill="none"
            stroke="var(--color-dg-elevated)"
            strokeWidth={KNOB_STROKE}
            strokeLinecap="round"
          />
          <path
            d={fullArc}
            fill="none"
            stroke={value != null && value > 0 ? color : "transparent"}
            strokeWidth={KNOB_STROKE}
            strokeLinecap="round"
            strokeDasharray={`${dashVisible} ${dashHidden}`}
            style={{ transition: arcTransition }}
          />
          {value != null && value > 0 && (
            <circle
              cx={thumbX}
              cy={thumbY}
              r={KNOB_STROKE / 2 + 1.5}
              fill={color}
              style={{ transition: thumbTransition }}
            />
          )}
          {/* Number + RATING label inside the knob */}
          {!editing && (
            <>
              {/* biome-ignore lint/a11y/noStaticElementInteractions: SVG text can't be a <button> */}
              <text
                x={cx}
                y={cy - 2}
                textAnchor="middle"
                dominantBaseline="central"
                fill={color}
                className="font-mono tabular-nums"
                style={{ fontSize: size * 0.3, cursor: "pointer", pointerEvents: "auto" }}
                onDoubleClick={startEditing}
              >
                {value != null ? value : "\u2014"}
              </text>
              <text
                x={cx}
                y={cy + size * 0.18}
                textAnchor="middle"
                dominantBaseline="central"
                fill="var(--color-dg-text-tertiary)"
                className="font-body"
                style={{ fontSize: size * 0.09, letterSpacing: "0.1em" }}
              >
                RATING
              </text>
            </>
          )}
        </svg>
        {editing && (
          <div className="absolute flex items-center justify-center" style={{ inset: 0 }}>
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
              className="w-12 text-center text-[1rem] tabular-nums bg-dg-bg border border-dg-border rounded-sm px-1 py-0 font-mono outline-none"
              style={{ color, borderColor: color }}
            />
          </div>
        )}
      </div>
      {ratingMode && (
        <p className="text-[0.6rem] text-dg-accent m-0 mt-1">
          = <span className="animate-pulse">_</span>
        </p>
      )}
      <p className="text-[0.5rem] text-dg-text-tertiary m-0 mt-1">
        drag to rate &middot; double-click to type
      </p>
    </div>
  );
}

function ReplayBadge({ replayCount, mediaType }: { replayCount: number; mediaType?: string }) {
  const label = replayCountLabel(replayCount, mediaType);
  if (!label) return null;
  return (
    <span className="text-[0.7rem] font-mono text-dg-text-tertiary border border-dg-border-subtle rounded-sm px-2 py-0.5">
      {label}
    </span>
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
  const saved = (
    <span className="inline-flex items-center gap-1">
      <Check size={12} weight="bold" /> saved
    </span>
  );
  const saveLabel = (() => {
    if (actionState === "pending") return <span className="dg-ellipsis">saving</span>;
    if (actionState === "done") return saved;
    if (actionState === "error") return "error \u2014 retry";
    return isDirty ? "save" : saved;
  })();

  return (
    <div className="flex items-center justify-between pt-3 mt-4 border-t border-dg-border-subtle">
      <Button
        variant={isDirty ? "accent" : "secondary"}
        size="compact"
        onClick={onSave}
        disabled={actionState === "pending" || !isDirty}
        title="Save changes"
      >
        {saveLabel}
      </Button>
      {hasServerEntry && (
        <Button
          variant="danger"
          size="compact"
          onClick={onRemove}
          disabled={actionState === "pending"}
          title="Remove from list"
        >
          delete
        </Button>
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
  children,
}: TrackingPanelProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const hasInitial = initialEntry !== undefined;
  const action = useAction();
  const removeEntry = useRemoveCatalogEntry();

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
      await removeEntry.mutateAsync({ wikidataId });
      router.navigate({ to: "/" });
    });
  }

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
  const today = todayISO();
  const wrapperClass =
    "rounded border border-dg-border-subtle bg-dg-surface p-[clamp(8px,2%,16px)]";

  if (!loaded) {
    return (
      <div className={wrapperClass}>
        <Spinner size={12} />
      </div>
    );
  }

  const showRating =
    localStatus === "in_progress" || localStatus === "completed" || localStatus === "mastered";

  return (
    <div className={`${wrapperClass} relative`}>
      {localStatus && (
        <button
          type="button"
          onClick={() => setLocalIsFavorite(!localIsFavorite)}
          className={cn(
            "dg-press absolute top-[clamp(8px,2%,16px)] right-[clamp(8px,2%,16px)] z-10 flex items-center bg-transparent border-none p-1",
            localIsFavorite
              ? "text-dg-accent hover:text-dg-accent/80"
              : "text-dg-text-tertiary hover:text-dg-accent/60",
          )}
          title={localIsFavorite ? "Remove from favorites" : "Mark as favorite"}
        >
          <Star size={18} weight={localIsFavorite ? "fill" : "regular"} />
        </button>
      )}
      <div className="flex flex-wrap" style={{ gap: "clamp(8px, 2%, 16px)" }}>
        {/* Left column: controls */}
        <div style={{ flex: "1 1 280px", minWidth: 0 }}>
          <StatusButtons
            statuses={statuses}
            localStatus={localStatus}
            localReplayCount={localReplayCount}
            statusAnimating={statusAnimating}
            isPending={isPending}
            mediaType={mediaType}
            onStatusChange={handleStatusChange}
          />

          {localStatus && (
            <>
              <hr className="dg-separator" />
              {isMovie && setLocalWatchedAt && (
                <p className="text-[0.6rem] text-dg-text-tertiary uppercase tracking-wider m-0 mb-1.5">
                  Watched on
                </p>
              )}
              <div className="flex items-center gap-g1 flex-wrap">
                {isMovie && setLocalWatchedAt && (
                  <input
                    type="date"
                    value={localWatchedAt ?? ""}
                    max={today}
                    onChange={(e) => setLocalWatchedAt(e.target.value || null)}
                    disabled={isPending}
                    className="text-[0.8rem] font-mono bg-dg-bg border border-dg-border rounded-sm px-2 py-1.5 text-dg-text outline-none focus:border-dg-accent hover:border-dg-border-strong transition-colors disabled:opacity-50"
                  />
                )}
                <ReplayBadge replayCount={localReplayCount} mediaType={mediaType} />
              </div>
            </>
          )}

          {children && <div className="mt-4">{children}</div>}
        </div>

        {/* Rating column: wraps below when narrow */}
        {showRating && (
          <div
            style={{ flex: "0 0 160px" }}
            className="flex items-center justify-center self-center mx-auto"
          >
            <RatingKnob
              value={localRating}
              isPending={isPending}
              ratingMode={ratingMode}
              onChange={setLocalRating}
            />
          </div>
        )}
      </div>

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

export const TYPE_BADGE_CLASSES: Record<string, string> = {
  movie: "bg-dg-movie/20 text-dg-movie border-dg-movie/40",
  tv_series: "bg-dg-tv/20 text-dg-tv border-dg-tv/40",
  anime: "bg-dg-anime/20 text-dg-anime border-dg-anime/40",
  game: "bg-dg-game/20 text-dg-game border-dg-game/40",
};

const BADGE_FALLBACK = "bg-dg-elevated text-dg-text-tertiary border-dg-border";

export function typeBadgeClass(mediaType?: string | null): string {
  return TYPE_BADGE_CLASSES[mediaType ?? ""] ?? BADGE_FALLBACK;
}

export function mediaTypeLabel(type: string, short = false): string {
  if (type === "tv_series") return short ? "TV" : "TV Series";
  return type.charAt(0).toUpperCase() + type.slice(1);
}

/** Maps 0–100 rating to a color: dark red → amber → green */
export function ratingColor(value: number | null): string | undefined {
  if (value == null || value === 0) return undefined;
  const t = value / 100;
  let h: number, s: number, l: number;
  if (t <= 0.5) {
    const p = t / 0.5;
    h = 0 + p * 40;
    s = 70 + p * 10;
    l = 45 + p * 10;
  } else {
    const p = (t - 0.5) / 0.5;
    h = 40 + p * 100;
    s = 80 - p * 20;
    l = 55 - p * 10;
  }
  return `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`;
}

// ─── Status Vocabulary ──────────────────────────────────────────────────────

export const STATUS_ORDER = [
  "in_progress",
  "planned",
  "on_hold",
  "completed",
  "dropped",
  "mastered",
] as const;
export type StatusValue = (typeof STATUS_ORDER)[number];

export const STATUS_LABELS_GENERIC: Record<StatusValue, string> = {
  in_progress: "In Progress",
  planned: "Planned",
  on_hold: "On Hold",
  completed: "Completed",
  dropped: "Dropped",
  mastered: "Mastered",
};

// Legacy status normalization (for PDS sync of old records)
const LEGACY_STATUS_MAP: Record<string, StatusValue> = {
  watching: "in_progress",
  plan_to_watch: "planned",
  paused: "on_hold",
};

export function normalizeStatus(s: string): StatusValue {
  return (LEGACY_STATUS_MAP[s] ?? s) as StatusValue;
}

// Per-type label map: null = status hidden for that type
type MediaTypeKey = "movie" | "tv_series" | "anime" | "game";

const STATUS_LABELS_BY_TYPE: Record<StatusValue, Partial<Record<MediaTypeKey, string | null>>> = {
  planned: {
    movie: "Plan to Watch",
    tv_series: "Plan to Watch",
    anime: "Plan to Watch",
    game: "Plan to Play",
  },
  in_progress: { movie: null, tv_series: "Watching", anime: "Watching", game: "Playing" },
  on_hold: { movie: null, tv_series: "Paused", anime: "Paused", game: "Paused" },
  completed: { movie: "Watched", tv_series: "Completed", anime: "Completed", game: "Completed" },
  dropped: { movie: "Dropped", tv_series: "Dropped", anime: "Dropped", game: "Dropped" },
  mastered: { movie: null, tv_series: null, anime: null, game: "100%" },
};

/** Type-specific label or generic fallback. Returns null if hidden for that type. */
export function statusLabel(status: StatusValue, mediaType?: string): string | null {
  if (mediaType && mediaType in (STATUS_LABELS_BY_TYPE[status] ?? {})) {
    return STATUS_LABELS_BY_TYPE[status][mediaType as MediaTypeKey] ?? null;
  }
  return STATUS_LABELS_GENERIC[status];
}

/** Filters STATUS_ORDER to visible statuses for the given media type. */
export function availableStatuses(mediaType?: string): StatusValue[] {
  if (!mediaType) return [...STATUS_ORDER];
  return STATUS_ORDER.filter((s) => statusLabel(s, mediaType) !== null);
}

/** "Watched x3" / "Replayed x2" / "Rewatched x2" */
export function replayCountLabel(count: number, mediaType?: string): string | null {
  if (count <= 0) return null;
  const verb = mediaType === "game" ? "Replayed" : mediaType === "movie" ? "Watched" : "Rewatched";
  return `${verb} x${count + 1}`;
}

// ─── Status Colors ──────────────────────────────────────────────────────────

/** Text color per status (homepage section headers) */
export const STATUS_ACCENT: Record<StatusValue, string> = {
  in_progress: "text-dg-accent",
  planned: "text-dg-tv",
  on_hold: "text-dg-text-tertiary",
  completed: "text-dg-game",
  dropped: "text-dg-anime",
  mastered: "text-dg-accent",
};

/** Border + bg + text per status (detail page buttons) */
export const STATUS_BUTTON_COLORS: Record<StatusValue, string> = {
  in_progress: "border-dg-accent text-dg-accent bg-dg-accent/10",
  planned: "border-dg-tv text-dg-tv bg-dg-tv/10",
  on_hold: "border-dg-text-tertiary text-dg-text-tertiary bg-dg-text-tertiary/10",
  completed: "border-dg-game text-dg-game bg-dg-game/10",
  dropped: "border-dg-anime text-dg-anime bg-dg-anime/10",
  mastered: "border-dg-accent text-dg-accent bg-dg-accent/10",
};

// ─── Watched Episodes Helpers ────────────────────────────────────────────────

export type WatchedEpisodes = Record<string, Record<string, string>>;

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function countWatchedEpisodes(watched: WatchedEpisodes | null | undefined): number {
  if (!watched) return 0;
  return Object.values(watched).reduce((sum, eps) => sum + Object.keys(eps).length, 0);
}

export function countSeasonWatched(
  watched: WatchedEpisodes | null | undefined,
  seasonNumber: number,
): number {
  if (!watched) return 0;
  const eps = watched[String(seasonNumber)];
  return eps ? Object.keys(eps).length : 0;
}

/** Mark episodes 1..ep as watched for a given season. Preserves existing dates. */
export function markThroughEpisode(
  watched: WatchedEpisodes | null | undefined,
  season: number,
  ep: number,
  date: string,
): WatchedEpisodes {
  const result: WatchedEpisodes = watched ? structuredClone(watched) : {};
  const key = String(season);
  if (!result[key]) result[key] = {};
  for (let i = 1; i <= ep; i++) {
    const epKey = String(i);
    if (!result[key][epKey]) result[key][epKey] = date;
  }
  return result;
}

/** Returns highest N where episodes 1..N are all watched for the given season. */
export function highestConsecutiveEpisode(
  watched: WatchedEpisodes | null | undefined,
  seasonNumber: number,
): number {
  if (!watched) return 0;
  const eps = watched[String(seasonNumber)];
  if (!eps) return 0;
  let n = 0;
  while (eps[String(n + 1)]) n++;
  return n;
}

/** Remove episodes in [fromEp, toEp] for a given season. Cleans up empty season keys. */
export function clearSeasonFrom(
  watched: WatchedEpisodes | null | undefined,
  season: number,
  fromEp: number,
  toEp: number,
): WatchedEpisodes {
  const result: WatchedEpisodes = watched ? structuredClone(watched) : {};
  const key = String(season);
  if (!result[key]) return result;
  for (let i = fromEp; i <= toEp; i++) {
    delete result[key][String(i)];
  }
  if (Object.keys(result[key]).length === 0) delete result[key];
  return result;
}

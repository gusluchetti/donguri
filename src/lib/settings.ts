import { STATUS_ORDER, type StatusValue } from "~/features/media/media-types";

export type WatchlistView = "list" | "grid" | "mixed";

const WATCHLIST_VIEW_KEY = "dg-watchlist-view";
const WATCHLIST_SECTIONS_KEY = "dg-watchlist-sections";

const DEFAULT_EXPANDED: readonly StatusValue[] = STATUS_ORDER;

export function getWatchlistView(): WatchlistView {
  if (typeof window === "undefined") return "mixed";
  const v = localStorage.getItem(WATCHLIST_VIEW_KEY);
  if (v === "list" || v === "grid" || v === "mixed") return v;
  return "mixed";
}

export function setWatchlistView(v: WatchlistView): void {
  localStorage.setItem(WATCHLIST_VIEW_KEY, v);
}

export function getExpandedSections(): StatusValue[] {
  if (typeof window === "undefined") return [...DEFAULT_EXPANDED];
  const raw = localStorage.getItem(WATCHLIST_SECTIONS_KEY);
  if (!raw) return [...DEFAULT_EXPANDED];
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr))
      return arr.filter((s: string) =>
        (STATUS_ORDER as readonly string[]).includes(s),
      ) as StatusValue[];
  } catch {
    /* ignore */
  }
  return [...DEFAULT_EXPANDED];
}

export function setExpandedSections(sections: StatusValue[]): void {
  localStorage.setItem(WATCHLIST_SECTIONS_KEY, JSON.stringify(sections));
}

export const TYPE_BADGE_CLASSES: Record<string, string> = {
  movie: "bg-dg-movie/20 text-dg-movie border-dg-movie/40",
  tv_series: "bg-dg-tv/20 text-dg-tv border-dg-tv/40",
  anime: "bg-dg-anime/20 text-dg-anime border-dg-anime/40",
  game: "bg-dg-game/20 text-dg-game border-dg-game/40",
};

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

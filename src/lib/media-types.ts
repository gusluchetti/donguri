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

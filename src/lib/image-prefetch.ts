const prefetched = new Set<string>();

export function prefetchImage(url: string): void {
  if (typeof window === "undefined") return;
  if (prefetched.has(url)) return;
  prefetched.add(url);
  const img = new Image();
  img.src = url;
}

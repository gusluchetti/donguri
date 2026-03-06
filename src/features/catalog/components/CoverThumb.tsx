import { useEffect, useRef, useState } from "react";
import { TYPE_HUES } from "~/features/media/media-types";
import { useTheme } from "~/lib/theme";

/**
 * Module-level set of image URLs that have already loaded in this session.
 * When a CoverThumb mounts with a URL that's already been loaded, it starts
 * with opacity 1 instead of fading in again — prevents the "flash" when
 * components re-mount from persisted cache on return visits.
 */
const loadedUrls = new Set<string>();

/**
 * Hue-based gradient placeholder with first-letter watermark,
 * or real poster when posterUrl is available.
 *
 * Two sizes:
 * - **Small** (default, size <= 60): ~4:3 portrait thumbnail for list rows (36×47).
 * - **Large** (size > 60): 2/3 aspect card for cover grids, deeper gradient,
 *   bigger watermark letter, heavier inner shadow.
 *
 * Uses a single w342 TMDB size for all views — CSS object-cover downscales cleanly,
 * and one URL per poster means one browser cache entry.
 *
 * The gradient placeholder is always rendered — the poster image fades in on top
 * once loaded, so there's never a blank flash.
 */

type CoverThumbProps = {
  hue?: number;
  mediaType?: string;
  title: string;
  size?: number;
  posterUrl?: string;
  loading?: "lazy" | "eager";
};

function buildInitials(title: string): string {
  return (
    title
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0].toUpperCase())
      .join("")
      .slice(0, 5) || "?"
  );
}

function initialsSize(count: number, large: boolean): number {
  if (large) {
    if (count <= 1) return 32;
    if (count <= 2) return 26;
    if (count <= 3) return 20;
    if (count <= 4) return 16;
    return 13;
  }
  if (count <= 1) return 14;
  if (count <= 2) return 12;
  if (count <= 3) return 10;
  if (count <= 4) return 8;
  return 7;
}

export function CoverThumb({
  hue,
  mediaType,
  title,
  size = 36,
  posterUrl,
  loading = "lazy",
}: CoverThumbProps) {
  const { theme } = useTheme();

  const isLight = theme === "light";
  const isLarge = size > 60;
  const h = hue ?? (mediaType ? (TYPE_HUES[mediaType] ?? 0) : 0);
  const initials = buildInitials(title);
  const fontSize = initialsSize(initials.length, isLarge);

  const imgSrc = posterUrl;

  // Start with loaded=true if this URL was already seen in this session,
  // so we skip the fade-in flash on return visits / re-renders.
  const alreadyCached = imgSrc ? loadedUrls.has(imgSrc) : false;
  const [loaded, setLoaded] = useState(alreadyCached || loading === "eager");

  // If the posterUrl changes, reset loaded state (unless the new URL is also cached).
  const prevSrc = useRef(imgSrc);
  if (prevSrc.current !== imgSrc) {
    prevSrc.current = imgSrc;
    const nowCached = imgSrc ? loadedUrls.has(imgSrc) : false;
    if (loaded !== nowCached) setLoaded(nowCached);
  }

  // Ref for detecting images that loaded before React hydration.
  // During SSR, images render with opacity:0 and the browser may load them
  // before React attaches the onLoad handler — so onLoad never fires.
  const imgRef = useRef<HTMLImageElement>(null);
  const loadedRef = useRef(loaded);
  loadedRef.current = loaded;
  useEffect(() => {
    const img = imgRef.current;
    if (img?.complete && img.naturalWidth > 0 && !loadedRef.current) {
      if (imgSrc) loadedUrls.add(imgSrc);
      setLoaded(true);
    }
  }, [imgSrc]);

  const onImageLoad = () => {
    if (imgSrc) loadedUrls.add(imgSrc);
    setLoaded(true);
  };

  if (isLarge) {
    return (
      <div
        className="w-full h-full rounded flex items-center justify-center relative overflow-hidden"
        style={{
          background: isLight
            ? `linear-gradient(160deg, hsl(${h},20%,82%) 0%, hsl(${h + 25},16%,74%) 100%)`
            : `linear-gradient(160deg, hsl(${h},22%,18%) 0%, hsl(${h + 25},18%,10%) 100%)`,
          border: "1px solid var(--color-dg-border)",
        }}
      >
        <span
          className="relative font-display font-semibold select-none tracking-tight"
          style={{
            fontSize,
            color: isLight ? `hsla(${h},30%,30%,0.15)` : `hsla(${h},25%,70%,0.15)`,
          }}
        >
          {initials}
        </span>
        <div
          className="absolute inset-0 rounded pointer-events-none"
          style={{
            boxShadow: isLight
              ? "inset 0 0 0 1px rgba(0,0,0,0.04), inset 0 2px 10px rgba(0,0,0,0.06)"
              : "inset 0 0 0 1px rgba(255,255,255,0.025), inset 0 2px 10px rgba(0,0,0,0.25)",
          }}
        />
        {imgSrc && (
          <img
            ref={imgRef}
            src={imgSrc}
            alt=""
            loading={loading}
            onLoad={onImageLoad}
            className="absolute inset-0 w-full h-full object-cover rounded"
            style={{ opacity: loaded ? 1 : 0, transition: "opacity 200ms ease-in" }}
          />
        )}
      </div>
    );
  }

  return (
    <div
      className="rounded-[3px] border border-dg-border shrink-0 flex items-center justify-center relative overflow-hidden"
      style={{
        width: size,
        height: Math.round(size * 1.3),
        background: isLight
          ? `linear-gradient(135deg, hsl(${h},20%,80%) 0%, hsl(${h + 30},16%,72%) 100%)`
          : `linear-gradient(135deg, hsl(${h},22%,20%) 0%, hsl(${h + 30},18%,13%) 100%)`,
      }}
    >
      <span
        className="relative font-display font-semibold select-none tracking-tight"
        style={{
          fontSize,
          color: isLight ? `hsla(${h},30%,30%,0.3)` : `hsla(${h},25%,70%,0.3)`,
        }}
      >
        {initials}
      </span>
      <div
        className="absolute inset-0 rounded-[3px] pointer-events-none"
        style={{
          boxShadow: isLight
            ? "inset 0 0 0 1px rgba(0,0,0,0.04), inset 0 1px 3px rgba(0,0,0,0.06)"
            : "inset 0 0 0 1px rgba(255,255,255,0.03), inset 0 1px 3px rgba(0,0,0,0.2)",
        }}
      />
      {imgSrc && (
        <img
          ref={imgRef}
          src={imgSrc}
          alt=""
          loading={loading}
          onLoad={onImageLoad}
          className="absolute inset-0 w-full h-full object-cover rounded-[3px]"
          style={{ opacity: loaded ? 1 : 0, transition: "opacity 200ms ease-in" }}
        />
      )}
    </div>
  );
}

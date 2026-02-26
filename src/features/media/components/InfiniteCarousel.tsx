import { useEffect, useRef, useState } from "react";
import type { Media } from "~/db/schema";
import { MediaCard } from "./MediaCard";

const PX_PER_SEC = 30;

export function InfiniteCarousel({ items }: { items: Media[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [halfWidth, setHalfWidth] = useState(0);

  const doubled = [...items, ...items];

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const ro = new ResizeObserver(() => {
      setHalfWidth(track.scrollWidth / 2);
    });
    ro.observe(track);

    return () => ro.disconnect();
  }, []);

  const duration = halfWidth > 0 ? halfWidth / PX_PER_SEC : 0;

  return (
    <div
      className="select-none max-w-[1100px] mx-auto px-g3 overflow-hidden opacity-60"
      style={{
        animation: "fadeIn 500ms ease-out both",
        maskImage: "linear-gradient(to right, transparent, black 20%, black 80%, transparent)",
        WebkitMaskImage:
          "linear-gradient(to right, transparent, black 20%, black 80%, transparent)",
      }}
    >
      <div
        ref={trackRef}
        className="flex gap-3"
        style={{
          width: "max-content",
          backfaceVisibility: "hidden",
          ["--carousel-distance" as string]: `-${halfWidth}px`,
          animation: duration > 0 ? `carouselScroll ${duration}s linear infinite` : "none",
        }}
      >
        {doubled.map((item, i) => (
          <MediaCard key={`${item.id}-${i}`} item={item} index={i % items.length} />
        ))}
      </div>
    </div>
  );
}

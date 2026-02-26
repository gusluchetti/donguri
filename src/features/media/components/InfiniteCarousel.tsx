import { useEffect, useRef } from "react";
import type { Media } from "~/db/schema";
import { MediaCard } from "./MediaCard";

const SPEED = 0.15;

export function InfiniteCarousel({ items }: { items: Media[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const posRef = useRef(0);
  const rafRef = useRef<number>(0);

  const doubled = [...items, ...items];

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    let halfWidth = 0;

    function measure() {
      if (!track) return;
      halfWidth = track.scrollWidth / 2;
    }

    requestAnimationFrame(measure);
    window.addEventListener("resize", measure);

    function animate() {
      if (halfWidth > 0 && track) {
        posRef.current += SPEED;
        if (posRef.current >= halfWidth) posRef.current -= halfWidth;
        track.style.transform = `translate3d(${-posRef.current}px, 0, 0)`;
      }
      rafRef.current = requestAnimationFrame(animate);
    }

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", measure);
    };
  }, []);

  return (
    <div
      className="select-none max-w-[1100px] mx-auto px-g3 overflow-hidden"
      style={{
        animation: "fadeIn 500ms ease-out both",
        maskImage: "linear-gradient(to right, transparent, black 10%, black 90%, transparent)",
        WebkitMaskImage:
          "linear-gradient(to right, transparent, black 10%, black 90%, transparent)",
      }}
    >
      <div
        ref={trackRef}
        className="flex gap-3"
        style={{ width: "max-content", willChange: "transform" }}
      >
        {doubled.map((item, i) => (
          <MediaCard key={`${item.id}-${i}`} item={item} index={i % items.length} />
        ))}
      </div>
    </div>
  );
}

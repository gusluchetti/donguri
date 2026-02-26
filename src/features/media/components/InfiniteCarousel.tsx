import useEmblaCarousel from "embla-carousel-react";
import { useEffect, useRef } from "react";
import type { Media } from "~/db/schema";
import { MediaCard } from "./MediaCard";

const SPEED = 0.5;

export function InfiniteCarousel({ items }: { items: Media[] }) {
  const rafRef = useRef<number>(0);

  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: true,
    dragFree: true,
    watchDrag: false,
    align: "start",
    containScroll: false,
  });

  useEffect(() => {
    if (!emblaApi) return;

    const engine = emblaApi.internalEngine();
    const {
      location,
      previousLocation,
      target,
      offsetLocation,
      scrollTarget,
      index,
      indexPrevious,
    } = engine;
    const limit = engine.limit;

    function scroll() {
      previousLocation.set(location);
      location.add(-SPEED);
      target.set(location);

      if (limit.reachedMin(offsetLocation.get())) {
        const currentIndex = scrollTarget.byDistance(0, false).index;
        if (index.get() !== currentIndex) {
          indexPrevious.set(index.get());
          index.set(currentIndex);
          emblaApi?.emit("select");
        }
      }

      rafRef.current = requestAnimationFrame(scroll);
    }

    rafRef.current = requestAnimationFrame(scroll);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [emblaApi]);

  // Duplicate to guarantee enough slides for seamless loop
  const slides = [...items, ...items];

  return (
    <div
      className="select-none relative max-w-[1100px] mx-auto px-g3"
      style={{ animation: "fadeIn 500ms ease-out both" }}
    >
      {/* Fade edges */}
      <div className="absolute inset-y-0 left-0 w-16 sm:w-24 z-10 pointer-events-none bg-gradient-to-r from-dg-bg to-transparent" />
      <div className="absolute inset-y-0 right-0 w-16 sm:w-24 z-10 pointer-events-none bg-gradient-to-l from-dg-bg to-transparent" />

      <div className="overflow-hidden" ref={emblaRef}>
        <div className="flex">
          {slides.map((item, i) => (
            <div
              key={`${item.id}-${i}`}
              className="shrink-0 grow-0 basis-[120px] min-w-0 pl-3 first:pl-0"
            >
              <MediaCard item={item} index={i % items.length} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

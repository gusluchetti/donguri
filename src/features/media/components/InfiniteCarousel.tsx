import useEmblaCarousel from "embla-carousel-react";
import { useCallback, useEffect, useRef } from "react";
import type { Media } from "~/db/schema";
import { MediaCard } from "./MediaCard";

const SPEED_NORMAL = 0.5;
const SPEED_HOVER = 0.2;

export function InfiniteCarousel({ items }: { items: Media[] }) {
  const speedRef = useRef(SPEED_NORMAL);
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

      const velocity = -speedRef.current;
      location.add(velocity);
      target.set(location);

      // Wrap around for infinite loop
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

  const onMouseEnter = useCallback(() => {
    speedRef.current = SPEED_HOVER;
  }, []);

  const onMouseLeave = useCallback(() => {
    speedRef.current = SPEED_NORMAL;
  }, []);

  // Duplicate to guarantee enough slides for seamless loop
  const slides = [...items, ...items];

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: hover slows carousel, not interactive
    <div
      className="select-none"
      style={{ animation: "fadeIn 500ms ease-out both" }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
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

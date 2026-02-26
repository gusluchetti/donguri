import AutoScroll from "embla-carousel-auto-scroll";
import useEmblaCarousel from "embla-carousel-react";
import { useCallback, useEffect } from "react";
import type { Media } from "~/db/schema";
import { MediaCard } from "./MediaCard";

const SPEED_NORMAL = 0.5;
const SPEED_HOVER = 0.2;

export function InfiniteCarousel({ items }: { items: Media[] }) {
  const [emblaRef, emblaApi] = useEmblaCarousel(
    {
      loop: true,
      dragFree: true,
      watchDrag: false,
      align: "start",
      containScroll: false,
    },
    [AutoScroll({ speed: SPEED_NORMAL, startDelay: 0, stopOnInteraction: false })],
  );

  useEffect(() => {
    if (!emblaApi) return;
    emblaApi.plugins().autoScroll?.play();
  }, [emblaApi]);

  const setSpeed = useCallback(
    (speed: number) => {
      const plugin = emblaApi?.plugins().autoScroll;
      if (!plugin) return;
      (plugin as unknown as { options: { speed: number } }).options.speed = speed;
    },
    [emblaApi],
  );

  const onMouseEnter = useCallback(() => setSpeed(SPEED_HOVER), [setSpeed]);
  const onMouseLeave = useCallback(() => setSpeed(SPEED_NORMAL), [setSpeed]);

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

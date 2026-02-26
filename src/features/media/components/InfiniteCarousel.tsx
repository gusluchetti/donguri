import AutoScroll from "embla-carousel-auto-scroll";
import useEmblaCarousel from "embla-carousel-react";
import type { Media } from "~/db/schema";
import { MediaCard } from "./MediaCard";

export function InfiniteCarousel({ items }: { items: Media[] }) {
  const [emblaRef] = useEmblaCarousel(
    {
      loop: true,
      dragFree: true,
      watchDrag: false,
      align: "start",
      containScroll: false,
    },
    [AutoScroll({ speed: 0.5, startDelay: 0, stopOnInteraction: false })],
  );

  return (
    <div className="select-none" style={{ animation: "fadeIn 500ms ease-out both" }}>
      <div className="overflow-hidden" ref={emblaRef}>
        <div className="flex">
          {items.map((item, i) => (
            <div key={item.id} className="shrink-0 grow-0 basis-[120px] min-w-0 pl-3 first:pl-0">
              <MediaCard item={item} index={i} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

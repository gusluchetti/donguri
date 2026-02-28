import type { Media } from "~/db/schema";
import { MediaCard } from "./MediaCard";

const CARD_SLOT = 132; // 120px card + 12px gap
const PX_PER_SEC = 30;

export function InfiniteCarousel({ items }: { items: Media[] }) {
  const doubled = [...items, ...items];
  const duration = (items.length * CARD_SLOT) / PX_PER_SEC;

  return (
    <div
      className="select-none overflow-x-clip pb-1"
      style={{
        maskImage: "linear-gradient(to right, transparent, black 15%, black 85%, transparent)",
        WebkitMaskImage:
          "linear-gradient(to right, transparent, black 15%, black 85%, transparent)",
      }}
    >
      <div
        className="flex gap-3"
        style={{
          width: "max-content",
          backfaceVisibility: "hidden",
          animation: `carouselScroll ${duration}s linear infinite`,
        }}
      >
        {doubled.map((item, i) => (
          <MediaCard key={`${item.id}-${i}`} item={item} index={i % items.length} />
        ))}
      </div>
    </div>
  );
}

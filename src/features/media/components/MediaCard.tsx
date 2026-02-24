import { Link } from "@tanstack/react-router";
import type { Media } from "~/db/schema";
import { SoundEngine } from "~/features/catalog/catalog.sound";
import { CoverThumb } from "~/features/catalog/components/CoverThumb";
import { StampBadge } from "~/features/catalog/components/StampBadge";
import { displayMediaType } from "~/features/media/media-types";

export function MediaCard({ item, index = 0 }: { item: Media; index?: number }) {
  return (
    <Link
      to="/catalog/$wikidataId"
      params={{ wikidataId: item.wikidataId }}
      className="shrink-0 w-[120px] no-underline text-inherit group"
      onClick={() => SoundEngine.navForward()}
    >
      <div className="w-full aspect-[2/3] rounded overflow-hidden relative">
        <div className="w-full h-full transition-transform duration-200 ease-out group-hover:scale-[1.03]">
          <CoverThumb
            title={item.title ?? "?"}
            mediaType={displayMediaType(item.mediaType, item.animationOrigin)}
            size={120}
            posterUrl={item.posterUrl ?? undefined}
            loading="eager"
          />
        </div>
      </div>
      <div className="mt-1.5 text-[0.7rem] font-medium text-dg-text truncate group-hover:text-dg-accent transition-colors">
        {item.title ?? item.wikidataId}
      </div>
      <div className="mt-0.5 flex items-center gap-1">
        <StampBadge type={displayMediaType(item.mediaType, item.animationOrigin)} index={index} />
      </div>
    </Link>
  );
}

import { useEffect, useState } from "react";
import { cn } from "~/lib/cn";

type Platform = {
  id: string;
  slug: string;
  name: string;
  parentId: string | null;
  sortOrder: number | null;
  parentName: string | null;
};

type PlatformGroup = {
  familyName: string;
  familySlug: string;
  children: Platform[];
};

function groupPlatforms(platforms: Platform[]): {
  standalone: Platform[];
  families: PlatformGroup[];
} {
  const childIds = new Set(platforms.filter((p) => p.parentId).map((p) => p.parentId as string));
  const standalone: Platform[] = [];
  const familyMap = new Map<string, PlatformGroup>();

  for (const p of platforms) {
    if (p.parentId && p.parentName) {
      let family = familyMap.get(p.parentId);
      if (!family) {
        family = { familyName: p.parentName, familySlug: p.parentId, children: [] };
        familyMap.set(p.parentId, family);
      }
      family.children.push(p);
    } else if (!childIds.has(p.id)) {
      standalone.push(p);
    }
  }

  return { standalone, families: [...familyMap.values()] };
}

const CHIP =
  "text-xs font-mono py-1.5 px-2.5 sm:py-1 sm:px-2 bg-dg-elevated border border-dg-border rounded-sm text-dg-text-secondary";

export function PlatformChips({ platforms }: { platforms: Platform[] }) {
  const { standalone, families } = groupPlatforms(platforms);
  const total = standalone.length + families.reduce((n, f) => n + f.children.length, 0);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (!expanded) return;
    const close = () => setExpanded(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [expanded]);

  if (total <= 4) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {families.flatMap((f) =>
          f.children.map((c) => (
            <span key={c.id} className={CHIP}>
              <span className="text-dg-text-tertiary">{f.familyName} &rsaquo; </span>
              {c.name}
            </span>
          )),
        )}
        {standalone.map((p) => (
          <span key={p.id} className={CHIP}>
            {p.name}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {families.map((f) => (
        <div key={f.familySlug} className="relative">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(expanded === f.familySlug ? null : f.familySlug);
            }}
            className={cn(
              CHIP,
              "cursor-pointer inline-flex items-center gap-1",
              expanded === f.familySlug && "border-dg-accent text-dg-accent",
            )}
          >
            {f.familyName}
            <span className="text-[0.625rem] font-mono opacity-60">{f.children.length}</span>
          </button>
          {expanded === f.familySlug && (
            <div className="absolute top-full left-0 mt-1 z-20 flex flex-col gap-1 bg-dg-surface border border-dg-border rounded-sm p-1.5 shadow-lg min-w-max">
              {f.children.map((c) => (
                <span key={c.id} className="text-xs text-dg-text-secondary px-2 py-1">
                  {c.name}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
      {standalone.map((p) => (
        <span key={p.id} className={CHIP}>
          {p.name}
        </span>
      ))}
    </div>
  );
}

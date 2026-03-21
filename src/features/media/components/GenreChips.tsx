import { useEffect, useState } from "react";
import { cn } from "~/lib/cn";

type Genre = {
  id: string;
  slug: string;
  name: string;
  parentId: string | null;
  sortOrder: number | null;
  parentName: string | null;
};

type GenreGroup = {
  familyName: string;
  familyId: string;
  children: Genre[];
};

function groupGenres(genres: Genre[]): {
  standalone: Genre[];
  families: GenreGroup[];
} {
  const childParentIds = new Set(genres.filter((g) => g.parentId).map((g) => g.parentId as string));
  const standalone: Genre[] = [];
  const familyMap = new Map<string, GenreGroup>();

  for (const g of genres) {
    if (g.parentId && g.parentName) {
      let family = familyMap.get(g.parentId);
      if (!family) {
        family = { familyName: g.parentName, familyId: g.parentId, children: [] };
        familyMap.set(g.parentId, family);
      }
      family.children.push(g);
    } else if (!childParentIds.has(g.id)) {
      standalone.push(g);
    }
  }

  return { standalone, families: [...familyMap.values()] };
}

const CHIP =
  "text-xs font-mono py-1.5 px-2.5 sm:py-1 sm:px-2 bg-dg-elevated border border-dg-border rounded-sm text-dg-text-secondary";

export function GenreChips({ genres }: { genres: Genre[] }) {
  const { standalone, families } = groupGenres(genres);
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
        {standalone.map((g) => (
          <span key={g.id} className={CHIP}>
            {g.name}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {families.map((f) => (
        <div key={f.familyId} className="relative">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(expanded === f.familyId ? null : f.familyId);
            }}
            className={cn(
              CHIP,
              "cursor-pointer inline-flex items-center gap-1",
              expanded === f.familyId && "border-dg-accent text-dg-accent",
            )}
          >
            {f.familyName}
            <span className="text-[0.625rem] font-mono opacity-60">{f.children.length}</span>
          </button>
          {expanded === f.familyId && (
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
      {standalone.map((g) => (
        <span key={g.id} className={CHIP}>
          {g.name}
        </span>
      ))}
    </div>
  );
}

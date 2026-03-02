import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useMemo, useRef } from "react";
import { ogTags, pageTitle } from "~/lib/og";

const Markdown = lazy(() => import("react-markdown"));

import rawRoadmap from "../../ROADMAP.md?raw";

const roadmapMd = rawRoadmap.replace(/<!--[\s\S]*?-->/g, "");

export const Route = createFileRoute("/roadmap")({
  head: () => ({
    meta: [
      { title: pageTitle("roadmap — donguri") },
      {
        name: "description",
        content:
          "See what's coming next for donguri — episode tracking, genre filtering, and more.",
      },
      ...ogTags({
        title: "Roadmap — donguri",
        description:
          "See what's coming next for donguri — episode tracking, genre filtering, and more.",
        path: "/roadmap",
      }),
    ],
  }),
  component: RoadmapPage,
});

const SECTION_COLORS: Record<string, string> = {
  "available now": "var(--color-dg-tv)",
  "next up": "var(--color-dg-game)",
  planned: "var(--color-dg-accent)",
  "on the horizon": "var(--color-dg-text-tertiary)",
};

type RenderContext = {
  sectionColor: string;
  sectionKey: string;
  beliefIndex: number;
};

function BeliefItem({ children, num }: { children: React.ReactNode; num: string }) {
  return (
    <div className="flex gap-3 items-start">
      <span className="text-[9px] text-dg-text-tertiary tabular-nums w-5 text-right shrink-0 mt-[5px]">
        {num}
      </span>
      <p className="font-display text-[0.875rem] sm:text-[0.9rem] font-light text-dg-text leading-relaxed">
        {children}
      </p>
    </div>
  );
}

function RoadmapListItem({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <div
      className="px-3 sm:px-4 py-3 sm:py-2.5 text-[0.85rem] text-dg-text-secondary"
      style={{ borderLeft: `2px solid ${color}` }}
    >
      {children}
    </div>
  );
}

function RoadmapPage() {
  // Mutable render context — reset each render, mutated synchronously as markdown renders top-to-bottom
  const ctx = useRef<RenderContext>({
    sectionColor: "var(--color-dg-text-tertiary)",
    sectionKey: "",
    beliefIndex: 0,
  });
  ctx.current = { sectionColor: "var(--color-dg-text-tertiary)", sectionKey: "", beliefIndex: 0 };

  // Components close over `ctx` (stable ref object), so memoizing with [] is safe
  const components = useMemo(
    () => ({
      h1: ({ children }: { children?: React.ReactNode }) => (
        <h1 className="font-display text-[1.8rem] sm:text-[2.25rem] font-normal tracking-[-0.03em] mb-2">
          <span className="text-dg-accent">{children}</span>
        </h1>
      ),

      h2: ({ children }: { children?: React.ReactNode }) => {
        const key = String(children).toLowerCase().trim();
        ctx.current.sectionKey = key;
        ctx.current.sectionColor = SECTION_COLORS[key] ?? "var(--color-dg-text-tertiary)";

        if (key === "what we believe") {
          return (
            <h2 className="font-display text-[1.25rem] sm:text-[1.4rem] font-light italic tracking-[-0.02em] text-dg-text mt-5 sm:mt-8 mb-3 sm:mb-4">
              {children}
            </h2>
          );
        }

        const color = ctx.current.sectionColor;
        return (
          <h2
            className="text-[0.8rem] uppercase tracking-wider mb-2 mt-4 sm:mt-6 first:mt-0 flex items-center gap-2"
            style={{ color }}
          >
            <span
              className="inline-block rounded-full shrink-0"
              style={{ width: 6, height: 6, background: color }}
            />
            {children}
          </h2>
        );
      },

      p: ({ children }: { children?: React.ReactNode }) => (
        <p className="text-dg-text-secondary text-[0.9rem] leading-relaxed mb-4 sm:mb-5">
          {children}
        </p>
      ),

      ul: ({ children }: { children?: React.ReactNode }) => (
        <div className="border border-dg-border-subtle rounded bg-dg-surface divide-y divide-dg-border-subtle mb-4 sm:mb-6 overflow-hidden">
          {children}
        </div>
      ),

      ol: ({ children }: { children?: React.ReactNode }) => {
        if (ctx.current.sectionKey === "what we believe") {
          ctx.current.beliefIndex = 0;
          return (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-6 sm:mb-10 pb-5 sm:pb-8 border-b border-dg-border-subtle">
              {children}
            </div>
          );
        }
        return <ol className="mb-4 list-decimal pl-5">{children}</ol>;
      },

      li: ({ children }: { children?: React.ReactNode }) => {
        if (ctx.current.sectionKey === "what we believe") {
          const num = String(++ctx.current.beliefIndex).padStart(2, "0");
          return <BeliefItem num={num}>{children}</BeliefItem>;
        }
        return <RoadmapListItem color={ctx.current.sectionColor}>{children}</RoadmapListItem>;
      },

      strong: ({ children }: { children?: React.ReactNode }) => (
        <span className="text-dg-text font-semibold">{children}</span>
      ),

      a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-dg-text-tertiary hover:text-dg-text-secondary transition-colors text-[0.75rem] tabular-nums"
        >
          {children}
        </a>
      ),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <div className="dg-page-enter text-dg-text flex-1 overflow-y-auto font-body">
      <div className="max-w-[1100px] mx-auto px-4 py-4 sm:px-6 sm:py-8">
        <Suspense
          fallback={
            <div className="flex justify-center py-12">
              <div
                className="w-5 h-5 border-2 border-dg-border-subtle rounded-full"
                style={{
                  borderTopColor: "var(--color-dg-accent)",
                  animation: "spin 0.6s linear infinite",
                }}
              />
              <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
            </div>
          }
        >
          <Markdown components={components}>{roadmapMd}</Markdown>
        </Suspense>
        <div className="mt-8 pt-4 border-t border-dg-border-subtle text-[0.7rem] text-dg-text-tertiary sm:hidden">
          v2026.02.25
        </div>
      </div>
    </div>
  );
}

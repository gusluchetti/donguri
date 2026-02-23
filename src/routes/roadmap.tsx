import { createFileRoute } from "@tanstack/react-router";
import Markdown from "react-markdown";
import rawRoadmap from "../../ROADMAP.md?raw";
import { ogTags, pageTitle } from "../lib/og";

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

// Tracks current roadmap section as markdown renders top-to-bottom
let _sectionColor = "var(--color-dg-text-tertiary)";
let _sectionKey = "";
let _beliefIndex = 0;

const SECTION_COLORS: Record<string, string> = {
  "available now": "var(--color-dg-tv)",
  "next up": "var(--color-dg-game)",
  planned: "var(--color-dg-accent)",
  "on the horizon": "var(--color-dg-text-tertiary)",
};

function RoadmapPage() {
  _sectionColor = "var(--color-dg-text-tertiary)";
  _sectionKey = "";
  _beliefIndex = 0;

  return (
    <div className="dg-page-enter text-dg-text flex-1 overflow-y-auto font-body">
      <div className="max-w-[1100px] mx-auto px-4 py-6 sm:px-6 sm:py-8">
        <Markdown
          components={{
            h1: ({ children }) => (
              <h1 className="font-display text-[1.8rem] sm:text-[2.25rem] font-normal tracking-[-0.03em] mb-2">
                <span className="text-dg-accent">{children}</span>
              </h1>
            ),
            h2: ({ children }) => {
              const key = String(children).toLowerCase().trim();
              _sectionKey = key;
              _sectionColor = SECTION_COLORS[key] ?? "var(--color-dg-text-tertiary)";

              if (key === "what we believe") {
                return (
                  <h2 className="font-display text-[1.25rem] sm:text-[1.4rem] font-light italic tracking-[-0.02em] text-dg-text mt-8 mb-4">
                    {children}
                  </h2>
                );
              }

              return (
                <h2
                  className="text-[0.8rem] uppercase tracking-wider mb-2 mt-6 first:mt-0 flex items-center gap-2"
                  style={{ color: _sectionColor }}
                >
                  <span
                    className="inline-block rounded-full shrink-0"
                    style={{ width: 6, height: 6, background: _sectionColor }}
                  />
                  {children}
                </h2>
              );
            },
            p: ({ children }) => (
              <p className="text-dg-text-secondary text-[0.9rem] leading-relaxed mb-4 sm:mb-5">
                {children}
              </p>
            ),
            ul: ({ children }) => (
              <div className="border border-dg-border-subtle rounded bg-dg-surface divide-y divide-dg-border-subtle mb-6 overflow-hidden">
                {children}
              </div>
            ),
            ol: ({ children }) => {
              if (_sectionKey === "what we believe") {
                _beliefIndex = 0;
                return (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10 pb-8 border-b border-dg-border-subtle">
                    {children}
                  </div>
                );
              }
              return <ol className="mb-4 list-decimal pl-5">{children}</ol>;
            },
            li: ({ children }) => {
              if (_sectionKey === "what we believe") {
                const num = String(++_beliefIndex).padStart(2, "0");
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
              return (
                <div
                  className="px-3 sm:px-4 py-3 sm:py-2.5 text-[0.85rem] text-dg-text-secondary"
                  style={{ borderLeft: `2px solid ${_sectionColor}` }}
                >
                  {children}
                </div>
              );
            },
            strong: ({ children }) => (
              <span className="text-dg-text font-semibold">{children}</span>
            ),
          }}
        >
          {roadmapMd}
        </Markdown>
      </div>
    </div>
  );
}

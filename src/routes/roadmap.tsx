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

function RoadmapPage() {
  return (
    <div className="flex-1">
      <div className="max-w-[1000px] mx-auto px-4 py-6 sm:px-6 sm:py-8">
        <Markdown
          components={{
            h1: ({ children }) => (
              <h1 className="text-base font-bold mb-2 text-balance">
                <span className="text-dg-accent">{children}</span>
              </h1>
            ),
            h2: ({ children }) => (
              <h2 className="text-xs uppercase tracking-wider mb-2 mt-4 first:mt-0 text-dg-text-secondary opacity-50 font-normal">
                {children}
              </h2>
            ),
            p: ({ children }) => (
              <p className="text-dg-text-secondary text-sm leading-relaxed mb-4 sm:mb-5">
                {children}
              </p>
            ),
            ul: ({ children }) => <div className="rounded bg-dg-surface mb-4">{children}</div>,
            li: ({ children }) => (
              <div className="px-3 sm:px-4 py-3 sm:py-2.5 text-sm text-dg-text-secondary">
                {children}
              </div>
            ),
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

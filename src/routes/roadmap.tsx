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

// Map section headings to confidence tiers
const SECTION_TIERS: Record<
  string,
  {
    headingClass: string;
    borderClass: string;
    itemOpacity: string;
    indent: string;
    listBg: string;
  }
> = {
  "Available now": {
    headingClass: "text-dg-accent font-bold",
    borderClass: "border-l-4 border-l-dg-accent",
    itemOpacity: "opacity-100",
    indent: "pl-0",
    listBg: "bg-dg-surface",
  },
  "Next up": {
    headingClass: "text-dg-text font-bold",
    borderClass: "border-l-2 border-l-dg-text-secondary",
    itemOpacity: "opacity-100",
    indent: "pl-0",
    listBg: "bg-dg-surface",
  },
  Planned: {
    headingClass: "text-dg-text-secondary font-normal",
    borderClass: "",
    itemOpacity: "opacity-85",
    indent: "pl-0",
    listBg: "bg-dg-surface/70",
  },
  "On the horizon": {
    headingClass: "text-dg-text-tertiary font-normal",
    borderClass: "",
    itemOpacity: "opacity-65",
    indent: "pl-0",
    listBg: "bg-dg-surface/40",
  },
};

let currentSection = "";

function RoadmapPage() {
  return (
    <div className="flex-1">
      <div className="max-w-[1000px] mx-auto px-4 py-6 sm:px-6 sm:py-8">
        <Markdown
          components={{
            h1: ({ children }) => (
              <h1 className="text-xl font-bold mb-2 text-balance">
                <span className="text-dg-accent">{children}</span>
              </h1>
            ),
            h2: ({ children }) => {
              const text = String(children);
              currentSection = text;
              const tier = SECTION_TIERS[text];

              // "What we believe" gets special treatment
              if (text === "What we believe") {
                return (
                  <h2 className="text-sm font-bold uppercase tracking-widest mb-4 mt-10 text-dg-accent">
                    {children}
                  </h2>
                );
              }

              return (
                <h2
                  className={`text-xs uppercase tracking-widest mb-2 mt-6 first:mt-0 ${tier?.headingClass ?? "text-dg-text-secondary"}`}
                >
                  {children}
                </h2>
              );
            },
            p: ({ children }) => {
              // Manifesto paragraphs get distinct treatment
              if (currentSection === "What we believe") {
                return (
                  <p className="text-dg-text-secondary text-sm leading-loose mb-4 sm:mb-5 pl-6">
                    {children}
                  </p>
                );
              }
              return (
                <p className="text-dg-text-secondary text-sm leading-relaxed mb-4 sm:mb-5">
                  {children}
                </p>
              );
            },
            ul: ({ children }) => {
              const tier = SECTION_TIERS[currentSection];
              return (
                <div
                  className={`rounded mb-4 ${tier?.borderClass ?? ""} ${tier?.listBg ?? "bg-dg-surface"} ${tier?.itemOpacity ?? ""}`}
                >
                  {children}
                </div>
              );
            },
            li: ({ children }) => (
              <div className="px-3 sm:px-4 py-3 sm:py-2.5 text-sm text-dg-text-secondary">
                {children}
              </div>
            ),
            strong: ({ children }) => {
              // Manifesto bold phrases in accent
              if (currentSection === "What we believe") {
                return <span className="text-dg-accent font-bold">{children}</span>;
              }
              return <span className="text-dg-text font-bold">{children}</span>;
            },
          }}
        >
          {roadmapMd}
        </Markdown>
      </div>
    </div>
  );
}

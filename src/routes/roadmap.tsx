import { createFileRoute } from "@tanstack/react-router";
import Markdown from "react-markdown";
import rawRoadmap from "../../ROADMAP.md?raw";
import { ogTags, pageTitle } from "../lib/og";
import styles from "./roadmap.module.css";

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
    <div className={styles.page}>
      <div className={styles.container}>
        <Markdown
          components={{
            h1: ({ children }) => <h1 className={styles.h1}>{children}</h1>,
            h2: ({ children }) => <h2 className={styles.h2}>{children}</h2>,
            p: ({ children }) => <p className={styles.p}>{children}</p>,
            ul: ({ children }) => <div className={styles.ul}>{children}</div>,
            li: ({ children }) => <div className={styles.li}>{children}</div>,
            strong: ({ children }) => <span className={styles.strong}>{children}</span>,
          }}
        >
          {roadmapMd}
        </Markdown>
      </div>
    </div>
  );
}

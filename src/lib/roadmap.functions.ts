import { createServerFn } from "@tanstack/react-start";
import { marked } from "marked";

const GITHUB_RAW_URL = "https://raw.githubusercontent.com/gusluchetti/donguri/main/ROADMAP.md";

export const getRoadmap = createServerFn({ method: "GET" }).handler(async () => {
  let markdown: string;

  try {
    // In development, try local filesystem first
    if (process.env.NODE_ENV === "development") {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const localPath = path.resolve(process.cwd(), "ROADMAP.md");
      if (fs.existsSync(localPath)) {
        markdown = fs.readFileSync(localPath, "utf-8");
        return marked.parse(markdown) as string;
      }
    }
  } catch {
    // Fall through to GitHub fetch
  }

  // Fetch from GitHub (works in production on CF Workers)
  const res = await fetch(GITHUB_RAW_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch roadmap: ${res.status}`);
  }
  markdown = await res.text();
  return marked.parse(markdown) as string;
});

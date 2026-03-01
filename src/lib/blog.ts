export interface BlogPost {
  slug: string;
  title: string;
  date: string;
  body: string;
}

function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return { meta: {}, body: raw };
  const meta: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx > 0) meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return { meta, body: match[2] };
}

const modules = import.meta.glob("/content/blog/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export const posts: BlogPost[] = Object.entries(modules)
  .map(([path, raw]) => {
    const { meta, body } = parseFrontmatter(raw);
    const slug = path.replace(/^.*\//, "").replace(/\.md$/, "");
    return {
      slug,
      title: meta.title ?? "Untitled",
      date: meta.date ?? "",
      body,
    };
  })
  .filter((p) => p.date)
  .sort((a, b) => b.date.localeCompare(a.date));

export function getPostBySlug(slug: string): BlogPost | undefined {
  return posts.find((p) => p.slug === slug);
}

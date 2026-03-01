/**
 * Blog post utilities — parse frontmatter from markdown files imported via
 * Vite's import.meta.glob at build time. No runtime file I/O, no CMS.
 */

export interface BlogPost {
  slug: string;
  title: string;
  date: string;
  body: string;
}

/** Simple frontmatter parser — avoids a gray-matter dependency for three fields. */
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

/** All blog posts, sorted newest-first. Computed once at module load. */
export const posts: BlogPost[] = Object.entries(modules)
  .map(([path, raw]) => {
    const { meta, body } = parseFrontmatter(raw);
    // Infer slug from filename (e.g. /content/blog/my-post.md → my-post)
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

/** Lookup a single post by slug. */
export function getPostBySlug(slug: string): BlogPost | undefined {
  return posts.find((p) => p.slug === slug);
}

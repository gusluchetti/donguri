import { createFileRoute, Link } from "@tanstack/react-router";
import { posts } from "~/lib/blog";
import { formatDate } from "~/lib/date";
import { ogTags, pageTitle } from "~/lib/og";

export const Route = createFileRoute("/news/")({
  head: () => ({
    meta: [
      { title: pageTitle("news — donguri") },
      {
        name: "description",
        content: "Updates, dev notes, and deploy logs from the donguri project.",
      },
      ...ogTags({
        title: "News — donguri",
        description: "Updates, dev notes, and deploy logs from the donguri project.",
        path: "/news",
      }),
    ],
  }),
  component: NewsIndex,
});

function excerpt(body: string, maxLen = 180): string {
  const line = body
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0 && !l.startsWith("#") && !l.startsWith("---"));
  if (!line) return "";
  const plain = line.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/[*_`~]/g, "");
  return plain.length > maxLen ? `${plain.slice(0, maxLen)}...` : plain;
}

function NewsIndex() {
  return (
    <div className="dg-page-enter text-dg-text flex-1 overflow-y-auto font-body">
      <div className="max-w-[900px] mx-auto px-4 py-4 sm:px-6 sm:py-8">
        <h1 className="font-display text-[1.8rem] sm:text-[2.25rem] font-normal tracking-[-0.03em] mb-6 sm:mb-8">
          <span className="text-dg-accent">news</span>
        </h1>

        {posts.length === 0 ? (
          <p className="text-dg-text-secondary text-[0.9rem]">No posts yet.</p>
        ) : (
          <div className="flex flex-col gap-1">
            {posts.map((post) => {
              const ex = excerpt(post.body);
              return (
                <Link
                  key={post.slug}
                  to="/news/$slug"
                  params={{ slug: post.slug }}
                  className="group no-underline block border border-transparent hover:border-dg-border-subtle rounded-md px-4 py-4 -mx-4 transition-colors duration-50"
                >
                  <div className="flex items-baseline gap-3 mb-1">
                    <time className="text-[0.7rem] text-dg-text-tertiary tabular-nums shrink-0">
                      {formatDate(post.date)}
                    </time>
                    <h2 className="font-display text-[1.1rem] sm:text-[1.2rem] font-normal text-dg-text group-hover:text-dg-accent transition-colors duration-50">
                      {post.title}
                    </h2>
                  </div>
                  {ex && (
                    <p className="text-[0.8rem] text-dg-text-tertiary leading-relaxed line-clamp-2">
                      {ex}
                    </p>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

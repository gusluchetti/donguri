import { ArrowLeft } from "@phosphor-icons/react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { getPostBySlug } from "~/lib/blog";
import { ogTags, pageTitle } from "~/lib/og";

const Markdown = lazy(() => import("react-markdown"));

export const Route = createFileRoute("/blog/$slug")({
  loader: ({ params }) => {
    const post = getPostBySlug(params.slug);
    if (!post) throw notFound();
    return post;
  },
  head: ({ loaderData }) => {
    if (!loaderData) return {};
    return {
      meta: [
        { title: pageTitle(`${loaderData.title} — donguri`) },
        ...ogTags({
          title: `${loaderData.title} — donguri`,
          description: `Blog post from ${formatDate(loaderData.date)}.`,
          path: `/blog/${loaderData.slug}`,
          type: "article",
        }),
      ],
    };
  },
  component: BlogPost,
  notFoundComponent: () => (
    <div className="text-dg-text flex-1 font-body flex items-center justify-center">
      <div className="text-center px-4 py-16">
        <p className="font-display text-[2rem] font-normal text-dg-accent mb-2">404</p>
        <p className="text-[0.9rem] text-dg-text-secondary mb-6">Post not found.</p>
        <Link
          to="/blog"
          className="text-[0.85rem] text-dg-accent no-underline py-2 px-4 border border-dg-accent/20 rounded-sm transition-all duration-50"
        >
          Back to blog
        </Link>
      </div>
    </div>
  ),
});

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function BlogPost() {
  const post = Route.useLoaderData();

  return (
    <div className="dg-page-enter text-dg-text flex-1 overflow-y-auto font-body">
      <div className="max-w-[700px] mx-auto px-4 py-4 sm:px-6 sm:py-8">
        <Link
          to="/blog"
          className="inline-flex items-center gap-1.5 text-[0.75rem] text-dg-text-tertiary no-underline hover:text-dg-text-secondary transition-colors duration-50 mb-6"
        >
          <ArrowLeft size={12} weight="bold" />
          all posts
        </Link>

        <header className="mb-6 sm:mb-8">
          <h1 className="font-display text-[1.8rem] sm:text-[2.25rem] font-normal tracking-[-0.03em] mb-2">
            <span className="text-dg-accent">{post.title}</span>
          </h1>
          <time className="text-[0.75rem] text-dg-text-tertiary tabular-nums">
            {formatDate(post.date)}
          </time>
        </header>

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
          <article className="prose-dg">
            <Markdown
              components={{
                h2: ({ children }) => (
                  <h2 className="font-display text-[1.25rem] sm:text-[1.4rem] font-normal tracking-[-0.02em] text-dg-text mt-6 sm:mt-8 mb-3">
                    {children}
                  </h2>
                ),
                h3: ({ children }) => (
                  <h3 className="font-display text-[1.05rem] sm:text-[1.15rem] font-normal text-dg-text mt-5 mb-2">
                    {children}
                  </h3>
                ),
                p: ({ children }) => (
                  <p className="text-dg-text-secondary text-[0.9rem] leading-relaxed mb-4">
                    {children}
                  </p>
                ),
                a: ({ href, children }) => (
                  <a
                    href={href}
                    target={href?.startsWith("/") ? undefined : "_blank"}
                    rel={href?.startsWith("/") ? undefined : "noopener noreferrer"}
                    className="text-dg-accent underline decoration-dg-accent/30 underline-offset-2 hover:decoration-dg-accent transition-colors duration-50"
                  >
                    {children}
                  </a>
                ),
                ul: ({ children }) => (
                  <ul className="mb-4 list-disc pl-5 text-[0.9rem] text-dg-text-secondary leading-relaxed">
                    {children}
                  </ul>
                ),
                ol: ({ children }) => (
                  <ol className="mb-4 list-decimal pl-5 text-[0.9rem] text-dg-text-secondary leading-relaxed">
                    {children}
                  </ol>
                ),
                li: ({ children }) => <li className="mb-1">{children}</li>,
                code: ({ children }) => (
                  <code className="text-[0.8rem] bg-dg-surface border border-dg-border-subtle rounded px-1.5 py-0.5 font-mono">
                    {children}
                  </code>
                ),
                blockquote: ({ children }) => (
                  <blockquote className="border-l-2 border-dg-accent/40 pl-4 my-4 text-dg-text-tertiary italic">
                    {children}
                  </blockquote>
                ),
              }}
            >
              {post.body}
            </Markdown>
          </article>
        </Suspense>

        <div className="mt-8 pt-4 border-t border-dg-border-subtle">
          <Link
            to="/blog"
            className="text-[0.8rem] text-dg-text-tertiary hover:text-dg-accent no-underline transition-colors duration-50"
          >
            back to all posts
          </Link>
        </div>
      </div>
    </div>
  );
}

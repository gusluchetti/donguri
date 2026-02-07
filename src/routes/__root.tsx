import { createRootRoute, HeadContent, Link, Outlet, Scripts } from "@tanstack/react-router";
import type { ReactNode } from "react";
import "../app.css";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "donguri" },
      {
        name: "description",
        content: "Track movies, TV, anime, and games across the ATmosphere.",
      },
    ],
    links: [
      {
        rel: "icon",
        href: "/favicon.ico",
      },
    ],
  }),
  component: RootComponent,
});

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="bg-dg-bg m-0 p-0">
        {children}
        <Scripts />
      </body>
    </html>
  );
}

const NAV_LINKS = [
  { to: "/", label: "donguri", accent: true },
  { to: "/catalog", label: "catalog" },
  { to: "/roadmap", label: "roadmap" },
] as const;

function RootComponent() {
  return (
    <RootDocument>
      <nav className="border-b border-dg-border-subtle px-6 py-3 font-mono">
        <div className="max-w-[1000px] mx-auto flex items-center gap-6">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              activeOptions={{ exact: true }}
              className="text-[0.85rem] no-underline transition-colors duration-150"
              activeProps={{ className: "text-dg-accent" }}
              inactiveProps={{
                className: link.accent
                  ? "text-dg-accent"
                  : "text-dg-text-secondary",
              }}
            >
              {link.accent ? (
                <span className="font-semibold">{link.label}</span>
              ) : (
                link.label
              )}
            </Link>
          ))}
        </div>
      </nav>
      <Outlet />
    </RootDocument>
  );
}

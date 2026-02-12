import { createRootRoute, HeadContent, Link, Outlet, Scripts } from "@tanstack/react-router";
import { Moon, Sun } from "lucide-react";
import type { ReactNode } from "react";
import "../app.css";
import { getAuthState, logout } from "../lib/auth.functions";
import { getUserTrackedIds } from "../lib/catalog.functions";
import { cacheClearAll } from "../lib/idb-cache";
import { ogTags } from "../lib/og";
import { swrLoad } from "../lib/swr-loader";
import { ThemeProvider, useTheme } from "../lib/theme";

const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('dg-theme');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t)}else if(window.matchMedia('(prefers-color-scheme: light)').matches){document.documentElement.setAttribute('data-theme','light')}else{document.documentElement.setAttribute('data-theme','dark')}}catch(e){document.documentElement.setAttribute('data-theme','dark')}})()`;

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, maximum-scale=1" },
      { name: "theme-color", content: "#d4a44a" },
      { title: "donguri" },
      {
        name: "description",
        content: "Track movies, TV, anime, and games. Your catalog, your data.",
      },
      ...ogTags({
        title: "donguri",
        description: "Track movies, TV, anime, and games. Your catalog, your data.",
        path: "/",
      }),
    ],
    links: [
      {
        rel: "icon",
        href: "/favicon.ico",
      },
      {
        rel: "manifest",
        href: "/manifest.json",
      },
    ],
  }),
  loader: async () => {
    const auth = await getAuthState();
    let trackedIds: Record<string, string | null> = {};
    if (auth) {
      try {
        const result = await swrLoad(() => getUserTrackedIds({}), {
          key: "trackedIds",
          maxAgeMs: 30_000,
        });
        trackedIds = result.data;
      } catch (err) {
        console.error("[root] getUserTrackedIds FAILED:", err, "(continuing with empty)");
      }
    }
    return { auth, trackedIds };
  },
  staleTime: 30_000,
  component: RootComponent,
});

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <HeadContent />
      </head>
      <body className="bg-dg-bg m-0 p-0">
        {children}
        <Scripts />
      </body>
    </html>
  );
}

const NAV_LINKS: readonly { to: string; label: string; accent?: boolean; exact?: boolean }[] = [
  { to: "/", label: "donguri", accent: true, exact: true },
  { to: "/catalog", label: "catalog", exact: false },
  { to: "/roadmap", label: "roadmap", exact: true },
];

function RootComponent() {
  const { auth } = Route.useLoaderData();

  return (
    <RootDocument>
      <ThemeProvider>
        <nav className="border-b border-dg-border-subtle px-4 sm:px-6 py-3 font-mono">
          <div className="max-w-[1000px] mx-auto flex items-center min-h-[44px] gap-4 sm:gap-6">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                activeOptions={{ exact: link.exact !== false }}
                className="text-[0.85rem] no-underline transition-colors duration-150 min-h-[44px] flex items-center"
                activeProps={{ className: "text-dg-accent" }}
                inactiveProps={{
                  className: link.accent ? "text-dg-accent" : "text-dg-text-secondary",
                }}
              >
                {link.accent ? <span className="font-semibold">{link.label}</span> : link.label}
              </Link>
            ))}
            <div className="ml-auto flex items-center gap-3">
              <ThemeToggle />
              {auth ? (
                <div className="flex items-center gap-4">
                  <span className="text-[0.8rem] text-dg-accent hidden sm:inline">
                    {auth.authMethod === "atproto" ? `@${auth.handle}` : auth.handle}
                  </span>
                  <button
                    type="button"
                    className="text-[0.8rem] text-dg-text-tertiary hover:text-dg-text-secondary transition-colors duration-150 cursor-pointer bg-transparent border-none font-mono min-h-[44px] flex items-center"
                    onClick={async () => {
                      await logout();
                      cacheClearAll();
                      window.location.href = "/";
                    }}
                  >
                    logout
                  </button>
                </div>
              ) : (
                <Link
                  to="/"
                  className="text-[0.8rem] text-dg-text-tertiary hover:text-dg-text-secondary no-underline transition-colors duration-150 min-h-[44px] flex items-center"
                >
                  login
                </Link>
              )}
            </div>
          </div>
        </nav>
        <Outlet />
      </ThemeProvider>
    </RootDocument>
  );
}

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const Icon = theme === "dark" ? Sun : Moon;

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="text-dg-text-tertiary hover:text-dg-text-secondary transition-colors duration-150 cursor-pointer bg-transparent border-none p-2 -m-1 min-w-[44px] min-h-[44px] flex items-center justify-center"
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
    >
      <Icon size={16} />
    </button>
  );
}

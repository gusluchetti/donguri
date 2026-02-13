import {
  createRootRoute,
  HeadContent,
  Link,
  Outlet,
  Scripts,
  useRouter,
} from "@tanstack/react-router";
import { Moon, Sun } from "lucide-react";
import { type ReactNode, useEffect } from "react";
import "../app.css";
import { getAuthState, logout } from "../lib/auth.functions";
import { getUserTrackedIds } from "../lib/catalog.functions";
import { cacheClearAll } from "../lib/idb-cache";
import { ogTags } from "../lib/og";
import { swrLoad } from "../lib/swr-loader";
import { getThemeCookie, ThemeProvider, useTheme } from "../lib/theme";

// Sets data-theme before first paint. Also syncs the cookie for SSR on next visit.
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('dg-theme');if(!t){t=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'}document.documentElement.setAttribute('data-theme',t);document.cookie='dg-theme='+t+';path=/;max-age=34560000;samesite=lax'}catch(e){document.documentElement.setAttribute('data-theme','dark')}})()`;

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
    const [auth, theme] = await Promise.all([getAuthState(), getThemeCookie()]);
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
    return { auth, trackedIds, theme };
  },
  staleTime: 30_000,
  component: RootComponent,
  notFoundComponent: NotFound,
});

function RootDocument({ children, theme }: { children: ReactNode; theme: string }) {
  return (
    <html lang="en" data-theme={theme} {...(import.meta.env.DEV ? { "data-env": "dev" } : {})}>
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: static inline script for theme init before paint */}
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
  const { auth, theme } = Route.useLoaderData();
  const router = useRouter();

  // Re-check auth when tab becomes visible (handles cross-tab login/logout)
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        router.invalidate();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [router]);

  // Auto-reload on stale server function IDs (client/server version mismatch after deploy)
  useEffect(() => {
    const onError = (e: PromiseRejectionEvent) => {
      const msg = e.reason?.message ?? String(e.reason ?? "");
      if (/server function/i.test(msg) || /Invalid server function ID/i.test(msg)) {
        console.warn("[version] stale client detected, reloading…");
        window.location.reload();
      }
    };
    window.addEventListener("unhandledrejection", onError);
    return () => window.removeEventListener("unhandledrejection", onError);
  }, []);

  return (
    <RootDocument theme={theme}>
      <ThemeProvider initialTheme={theme}>
        <div className="min-h-dvh flex flex-col">
          <nav className="border-b border-dg-border-subtle px-4 sm:px-6 py-3 font-mono shrink-0">
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
        </div>
      </ThemeProvider>
    </RootDocument>
  );
}

function NotFound() {
  return (
    <div className="bg-dg-bg text-dg-text flex-1 font-mono flex items-center justify-center">
      <div className="text-center px-4 py-16">
        <p className="text-[2rem] font-semibold text-dg-accent mb-2">404</p>
        <p className="text-[0.9rem] text-dg-text-secondary mb-6">Page not found.</p>
        <Link
          to="/"
          className="text-[0.85rem] text-dg-accent no-underline py-2 px-4 border border-dg-accent/20 rounded-sm transition-all duration-150"
        >
          Go home
        </Link>
      </div>
    </div>
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

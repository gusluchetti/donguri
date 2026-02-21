import { HotkeysProvider, useHotkey, useHotkeySequence } from "@tanstack/react-hotkeys";
import type { QueryClient } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  type ErrorComponentProps,
  HeadContent,
  Link,
  Outlet,
  Scripts,
  useLocation,
  useNavigate,
} from "@tanstack/react-router";
import { clear } from "idb-keyval";
import { Moon, Sun, Volume2, VolumeX } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import "../app.css";
import { getAuthState, logout } from "../lib/auth.functions";
import { getCatalogFingerprint } from "../lib/catalog.functions";
import { HelpOverlay } from "../lib/hotkeys/HelpOverlay";
import { isInputFocused } from "../lib/hotkeys/shortcuts";
import { ogTags, pageTitle } from "../lib/og";
import { checkCatalogFreshness } from "../lib/query";
import { trackedIdsOptions } from "../lib/query-options";
import { SoundProvider, useSound } from "../lib/sound";
import { getThemeCookie, ThemeProvider, useTheme } from "../lib/theme";

// Sets data-theme + color-scheme before first paint
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('dg-theme');if(!t){t=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'}document.documentElement.setAttribute('data-theme',t);document.documentElement.style.colorScheme=t;document.cookie='dg-theme='+t+';path=/;max-age=34560000;samesite=lax'}catch(e){document.documentElement.setAttribute('data-theme','dark')}})()`;

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, maximum-scale=1" },
      { name: "theme-color", content: "#d4a44a" },
      { title: pageTitle("donguri") },
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
        rel: "preload",
        href: "/fonts/CMUSansSerif.woff2",
        as: "font",
        type: "font/woff2",
        crossOrigin: "anonymous",
      },
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
  loader: async ({ context }) => {
    const [auth, theme] = await Promise.all([getAuthState(), getThemeCookie()]);
    let trackedIds: Record<string, string | null> = {};
    if (auth) {
      try {
        const [ids, fingerprint] = await Promise.all([
          context.queryClient.fetchQuery(trackedIdsOptions()),
          getCatalogFingerprint(),
        ]);
        trackedIds = ids;
        checkCatalogFreshness(context.queryClient, fingerprint);
      } catch (err) {
        console.error("[root] getUserTrackedIds FAILED:", err, "(continuing with empty)");
      }
    }
    return { auth, trackedIds, theme };
  },
  staleTime: 5 * 60 * 1000,
  component: RootComponent,
  errorComponent: RootError,
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
      <body className="bg-dg-bg text-dg-text font-sans m-0 p-0">
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
  const queryClient = Route.useRouteContext().queryClient;

  // Global error handler: stale deploys + expired AT Protocol sessions
  useEffect(() => {
    const onError = (e: PromiseRejectionEvent) => {
      const msg = e.reason?.message ?? String(e.reason ?? "");
      if (/SESSION_EXPIRED/.test(msg)) {
        console.warn("[auth] session expired, forcing logout…");
        e.preventDefault();
        queryClient.clear();
        clear();
        window.location.href = "/";
        return;
      }
      if (/server function/i.test(msg) || /Invalid server function ID/i.test(msg)) {
        console.warn("[version] stale client detected, reloading…");
        window.location.reload();
      }
    };
    window.addEventListener("unhandledrejection", onError);
    return () => window.removeEventListener("unhandledrejection", onError);
  }, [queryClient]);

  // Play sound on every route change (link clicks, not just hotkeys)
  const { playSound } = useSound();
  const pathname = useLocation({ select: (l) => l.pathname });
  const prevPathname = useRef(pathname);
  useEffect(() => {
    if (prevPathname.current !== pathname) {
      playSound("navigate");
      prevPathname.current = pathname;
    }
  }, [pathname, playSound]);

  const [showHelp, setShowHelp] = useState(false);

  return (
    <RootDocument theme={theme}>
      <ThemeProvider initialTheme={theme}>
        <SoundProvider>
          <HotkeysProvider>
            <GlobalShortcuts showHelp={showHelp} setShowHelp={setShowHelp} />
            <div className="min-h-dvh flex flex-col">
              <nav className="px-4 sm:px-6 shrink-0 border-b dg-gradient-line">
                <div className="max-w-[1000px] mx-auto flex items-center min-h-[44px] gap-5 sm:gap-7">
                  {NAV_LINKS.map((link) => (
                    <Link
                      key={link.to}
                      to={link.to}
                      activeOptions={{ exact: link.exact !== false }}
                      className={`no-underline min-h-[44px] flex items-center border-b-2 transition-all duration-[120ms] ease-out ${
                        link.accent
                          ? "text-lg font-bold text-dg-accent border-transparent"
                          : "text-base border-transparent"
                      }`}
                      activeProps={{
                        className: link.accent
                          ? "text-lg font-bold text-dg-accent border-dg-accent"
                          : "text-dg-accent border-dg-accent",
                      }}
                      inactiveProps={{
                        className: link.accent ? "" : "text-dg-text-secondary hover:text-dg-text",
                      }}
                    >
                      {link.label}
                    </Link>
                  ))}
                  <div className="ml-auto flex items-center gap-1">
                    <SoundToggle />
                    <ThemeToggle />
                    {auth ? (
                      <div className="flex items-center gap-3 ml-2">
                        <span className="text-sm text-dg-accent hidden sm:inline">
                          {auth.authMethod === "atproto" ? `@${auth.handle}` : auth.handle}
                        </span>
                        <button
                          type="button"
                          className="text-sm text-dg-text-tertiary hover:text-dg-text-secondary transition-colors duration-[80ms] cursor-pointer bg-transparent border-none min-h-[44px] flex items-center active:scale-[0.97]"
                          onClick={async () => {
                            await logout();
                            queryClient.clear();
                            clear();
                            window.location.href = "/";
                          }}
                        >
                          logout
                        </button>
                      </div>
                    ) : (
                      <Link
                        to="/"
                        className="text-sm text-dg-text-tertiary hover:text-dg-text-secondary no-underline transition-colors duration-[80ms] min-h-[44px] flex items-center ml-2"
                      >
                        login
                      </Link>
                    )}
                  </div>
                </div>
              </nav>
              <Outlet />
              <footer className="px-4 sm:px-6 py-3 shrink-0 border-t dg-gradient-line bg-dg-surface/40">
                <div className="max-w-[1000px] mx-auto flex items-center justify-between text-[0.8125rem] text-dg-text-tertiary">
                  <span className="flex items-center gap-3">
                    <span>v0.3.0</span>
                    <button
                      type="button"
                      onClick={() => setShowHelp(true)}
                      className="text-dg-text-tertiary hover:text-dg-text-secondary bg-transparent border-none cursor-pointer p-0 text-[0.8125rem] transition-colors active:scale-[0.97]"
                    >
                      shortcuts (?)
                    </button>
                  </span>
                  <span className="hidden sm:inline">
                    data from{" "}
                    <a
                      href="https://www.wikidata.org"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-dg-text-tertiary underline decoration-dg-border hover:text-dg-text-secondary transition-colors"
                    >
                      Wikidata
                    </a>
                    {" \u00b7 "}
                    <a
                      href="https://www.themoviedb.org"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-dg-text-tertiary underline decoration-dg-border hover:text-dg-text-secondary transition-colors"
                    >
                      TMDB
                    </a>
                    {" \u00b7 "}
                    <a
                      href="https://www.tvmaze.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-dg-text-tertiary underline decoration-dg-border hover:text-dg-text-secondary transition-colors"
                    >
                      TVMaze
                    </a>
                    {" \u00b7 "}
                    <a
                      href="https://github.com/manami-project/anime-offline-database"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-dg-text-tertiary underline decoration-dg-border hover:text-dg-text-secondary transition-colors"
                    >
                      anime-offline-database
                    </a>
                  </span>
                </div>
              </footer>
            </div>
          </HotkeysProvider>
        </SoundProvider>
      </ThemeProvider>
    </RootDocument>
  );
}

function GlobalShortcuts({
  showHelp,
  setShowHelp,
}: {
  showHelp: boolean;
  setShowHelp: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const navigate = useNavigate();
  const { toggleTheme } = useTheme();
  const { playSound } = useSound();

  // ? — toggle help overlay (Shift+/ produces "?")
  useHotkey({ key: "?", shift: true }, () => setShowHelp((v) => !v));

  // . — toggle theme
  useHotkey(".", () => {
    toggleTheme();
    playSound("toggle");
  });

  // g h — go home (sequence, needs input guard)
  useHotkeySequence(["G", "H"], () => {
    if (isInputFocused()) return;
    playSound("navigate");
    navigate({ to: "/" });
  });

  // g c — go to catalog
  useHotkeySequence(["G", "C"], () => {
    if (isInputFocused()) return;
    playSound("navigate");
    navigate({ to: "/catalog" });
  });

  // g r — go to roadmap
  useHotkeySequence(["G", "R"], () => {
    if (isInputFocused()) return;
    playSound("navigate");
    navigate({ to: "/roadmap" });
  });

  return <HelpOverlay open={showHelp} onClose={() => setShowHelp(false)} />;
}

function RootError({ error, reset }: ErrorComponentProps) {
  useEffect(() => {
    console.error("[root] uncaught error:", error);
  }, [error]);

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Something went wrong — donguri</title>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: static inline script for theme init before paint */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <HeadContent />
      </head>
      <body className="bg-dg-bg text-dg-text font-sans m-0 p-0">
        <div className="min-h-dvh flex items-center justify-center">
          <div className="text-center px-4 py-16">
            <p className="text-2xl font-bold text-dg-anime mb-2">error</p>
            <p className="text-base text-dg-text-secondary mb-6">Something went wrong.</p>
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={reset}
                className="text-sm text-dg-accent bg-transparent py-2 px-4 border border-dg-accent/20 rounded-sm cursor-pointer transition-all duration-100 active:scale-[0.97]"
              >
                Try again
              </button>
              <a
                href="/"
                className="text-sm text-dg-text-secondary no-underline py-2 px-4 border border-dg-border-subtle rounded-sm transition-all duration-100"
              >
                Go home
              </a>
            </div>
          </div>
        </div>
        <Scripts />
      </body>
    </html>
  );
}

function NotFound() {
  return (
    <div className="bg-dg-bg text-dg-text flex-1 flex items-center justify-center">
      <div className="text-center px-4 py-16">
        <p className="text-2xl font-bold text-dg-accent mb-2">404</p>
        <p className="text-base text-dg-text-secondary mb-6">Page not found.</p>
        <Link
          to="/"
          className="text-sm text-dg-accent no-underline py-2 px-4 border border-dg-accent/20 rounded-sm transition-all duration-100 active:scale-[0.97]"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const { playSound } = useSound();
  const Icon = theme === "dark" ? Sun : Moon;

  return (
    <button
      type="button"
      onClick={() => {
        toggleTheme();
        playSound("toggle");
      }}
      className="text-dg-text-tertiary hover:text-dg-text-secondary transition-colors duration-[80ms] cursor-pointer bg-transparent border-none p-2 -m-1 min-w-[44px] min-h-[44px] flex items-center justify-center active:scale-[0.97]"
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
    >
      <Icon size={16} />
    </button>
  );
}

function SoundToggle() {
  const { enabled, setEnabled, playSound } = useSound();
  const Icon = enabled ? Volume2 : VolumeX;

  return (
    <button
      type="button"
      onClick={() => {
        const next = !enabled;
        setEnabled(next);
        if (next) playSound("toggle");
      }}
      className="text-dg-text-tertiary hover:text-dg-text-secondary transition-colors duration-[80ms] cursor-pointer bg-transparent border-none p-2 -m-1 min-w-[44px] min-h-[44px] flex items-center justify-center active:scale-[0.97]"
      aria-label={enabled ? "Mute sounds" : "Enable sounds"}
      title={enabled ? "Mute sounds" : "Enable sounds"}
    >
      <Icon size={16} />
    </button>
  );
}

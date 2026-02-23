import { HotkeysProvider, useHotkey, useHotkeySequence } from "@tanstack/react-hotkeys";
import type { QueryClient } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  type ErrorComponentProps,
  HeadContent,
  Link,
  Outlet,
  Scripts,
  useNavigate,
} from "@tanstack/react-router";
import { clear } from "idb-keyval";
import { type ReactNode, useEffect, useState } from "react";
import "../app.css";
import { BackgroundLayers } from "../components/BackgroundLayers";
import { getAuthState, logout } from "../lib/auth.functions";
import { getCatalogFingerprint } from "../lib/catalog.functions";
import { HelpOverlay } from "../lib/hotkeys/HelpOverlay";
import { isInputFocused } from "../lib/hotkeys/shortcuts";
import { ogTags, pageTitle } from "../lib/og";
import { checkCatalogFreshness } from "../lib/query";
import { trackedIdsOptions } from "../lib/query-options";
import { SoundEngine } from "../lib/sound";
import { getThemeCookie, ThemeProvider, useTheme } from "../lib/theme";

// Sets data-theme before first paint. Also syncs the cookie for SSR on next visit.
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('dg-theme');if(!t){t=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'}document.documentElement.setAttribute('data-theme',t);document.cookie='dg-theme='+t+';path=/;max-age=34560000;samesite=lax'}catch(e){document.documentElement.setAttribute('data-theme','dark')}})()`;

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, maximum-scale=1" },
      { name: "theme-color", content: "#b8a472" },
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
      { rel: "icon", type: "image/svg+xml", href: "/acorn.svg" },
      { rel: "icon", href: "/favicon.ico" },
      { rel: "manifest", href: "/manifest.json" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,100..900;1,9..144,100..900&family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&display=swap",
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
    <html lang="en" data-theme={theme}>
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: static inline script for theme init before paint */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <HeadContent />
      </head>
      <body className="bg-dg-bg m-0 p-0">
        <BackgroundLayers />
        {children}
        <Scripts />
      </body>
    </html>
  );
}

const NAV_ITEMS: readonly { to: string; label: string; exact?: boolean }[] = [
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
        console.warn("[auth] session expired, forcing logout\u2026");
        e.preventDefault();
        queryClient.clear();
        clear();
        window.location.href = "/";
        return;
      }
      if (/server function/i.test(msg) || /Invalid server function ID/i.test(msg)) {
        console.warn("[version] stale client detected, reloading\u2026");
        window.location.reload();
      }
    };
    window.addEventListener("unhandledrejection", onError);
    return () => window.removeEventListener("unhandledrejection", onError);
  }, [queryClient]);

  const [showHelp, setShowHelp] = useState(false);

  return (
    <RootDocument theme={theme}>
      <ThemeProvider initialTheme={theme}>
        <HotkeysProvider>
          <GlobalShortcuts showHelp={showHelp} setShowHelp={setShowHelp} />
          <div className="h-dvh overflow-hidden flex flex-col relative z-[2]">
            <nav
              className="font-body shrink-0 sticky top-0 z-30"
              style={{
                background: "var(--nav-bg)",
                backdropFilter: "blur(16px) saturate(1.3)",
                WebkitBackdropFilter: "blur(16px) saturate(1.3)",
                borderBottom: "1px solid var(--color-dg-border-subtle)",
                viewTransitionName: "nav",
              }}
            >
              <div className="max-w-[1100px] mx-auto px-3 sm:px-g3 flex items-center justify-between h-12">
                {/* Left: logo + nav items */}
                <div className="flex items-center gap-1 sm:gap-g1">
                  <Link
                    to="/"
                    className="flex items-center gap-g1 no-underline cursor-pointer"
                    onClick={() => SoundEngine.click()}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 256 256"
                      width={24}
                      height={24}
                      fill="currentColor"
                      style={{ color: "var(--color-dg-accent)" }}
                      aria-hidden="true"
                    >
                      <path d="M232,104a56.06,56.06,0,0,0-56-56H136a24,24,0,0,1,24-24,8,8,0,0,0,0-16,40,40,0,0,0-40,40H80a56.06,56.06,0,0,0-56,56,16,16,0,0,0,8,13.83V128c0,35.53,33.12,62.12,59.74,83.49C103.66,221.07,120,234.18,120,240a8,8,0,0,0,16,0c0-5.82,16.34-18.93,28.26-28.51C190.88,190.12,224,163.53,224,128V117.83A16,16,0,0,0,232,104ZM80,64h96a40.06,40.06,0,0,1,40,40H40A40,40,0,0,1,80,64Zm74.25,135c-10.62,8.52-20,16-26.25,23.37-6.25-7.32-15.63-14.85-26.25-23.37C77.8,179.79,48,155.86,48,128v-8H208v8C208,155.86,178.2,179.79,154.25,199Z" />
                    </svg>
                    <span className="hidden sm:inline font-display text-lg font-medium text-dg-text">
                      donguri
                    </span>
                  </Link>
                  {import.meta.env.DEV && (
                    <span className="text-[0.65rem] font-bold font-mono text-dg-movie tracking-wider bg-dg-movie/10 border border-dg-movie/30 rounded-sm px-1.5 py-0.5">
                      DEV
                    </span>
                  )}

                  {NAV_ITEMS.map((item) => (
                    <NavButton key={item.to} to={item.to} exact={item.exact !== false}>
                      {item.label}
                    </NavButton>
                  ))}
                </div>

                {/* Right: controls */}
                <div className="flex items-center gap-1">
                  {auth && (
                    <span className="text-xs text-dg-accent hidden sm:inline mr-2">
                      {auth.authMethod === "atproto" ? `@${auth.handle}` : auth.handle}
                    </span>
                  )}
                  <div
                    className="mx-1 hidden sm:block"
                    style={{
                      width: 1,
                      height: 16,
                      background: "var(--color-dg-border)",
                    }}
                  />
                  <SoundToggle />
                  <ThemeToggle />
                  {auth ? (
                    <button
                      type="button"
                      className="bg-transparent border border-dg-border rounded-[3px] py-1 px-2 text-xs text-dg-text-tertiary font-body cursor-pointer transition-all duration-150 hover:border-dg-border-strong hover:text-dg-text-secondary"
                      onClick={async () => {
                        await logout();
                        queryClient.clear();
                        clear();
                        window.location.href = "/";
                      }}
                    >
                      logout
                    </button>
                  ) : (
                    <Link
                      to="/"
                      className="bg-transparent border border-dg-border rounded-[3px] py-1 px-2 text-xs text-dg-text-tertiary no-underline font-body transition-all duration-150 hover:border-dg-border-strong hover:text-dg-text-secondary"
                    >
                      login
                    </Link>
                  )}
                </div>
              </div>
            </nav>
            <Outlet />
            <footer className="border-t border-dg-border-subtle px-g3 py-3 font-body shrink-0">
              <div className="max-w-[1100px] mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-[0.7rem] text-dg-text-tertiary">
                <span className="flex items-center gap-2">
                  <span>v0.3.0</span>
                  <button
                    type="button"
                    onClick={() => setShowHelp(true)}
                    className="text-dg-text-tertiary hover:text-dg-text-secondary bg-transparent border-none font-body cursor-pointer p-0 text-[0.7rem] transition-colors"
                  >
                    shortcuts (?)
                  </button>
                </span>
                <span>
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

  // ? — toggle help overlay (Shift+/ produces "?")
  useHotkey({ key: "?", shift: true }, () => setShowHelp((v) => !v));

  // . — toggle theme
  useHotkey(".", toggleTheme);

  // g h — go home (sequence, needs input guard)
  useHotkeySequence(["G", "H"], () => {
    if (isInputFocused()) return;
    navigate({ to: "/" });
  });

  // g c — go to catalog
  useHotkeySequence(["G", "C"], () => {
    if (isInputFocused()) return;
    navigate({ to: "/catalog" });
  });

  // g r — go to roadmap
  useHotkeySequence(["G", "R"], () => {
    if (isInputFocused()) return;
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
      <body className="bg-dg-bg m-0 p-0">
        <div className="min-h-dvh flex items-center justify-center font-body text-dg-text">
          <div className="text-center px-4 py-16">
            <p className="font-display text-[2rem] font-normal text-dg-anime mb-2">error</p>
            <p className="text-[0.9rem] text-dg-text-secondary mb-6">Something went wrong.</p>
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={reset}
                className="text-[0.85rem] text-dg-accent font-body bg-transparent py-2 px-4 border border-dg-accent/20 rounded-sm cursor-pointer transition-all duration-150"
              >
                Try again
              </button>
              <a
                href="/"
                className="text-[0.85rem] text-dg-text-secondary no-underline py-2 px-4 border border-dg-border-subtle rounded-sm transition-all duration-150"
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
    <div className="text-dg-text flex-1 font-body flex items-center justify-center">
      <div className="text-center px-4 py-16">
        <p className="font-display text-[2rem] font-normal text-dg-accent mb-2">404</p>
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

function NavButton({
  to,
  exact,
  children,
}: {
  to: string;
  exact: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      activeOptions={{ exact }}
      className="no-underline font-body text-xs tracking-[0.06em] uppercase rounded-[3px] py-[5px] px-2 sm:px-3 transition-all duration-150 border relative"
      activeProps={{
        className: "bg-dg-accent-soft border-dg-accent text-dg-accent font-semibold",
      }}
      inactiveProps={{
        className: "bg-transparent border-transparent text-dg-text-secondary",
      }}
      onClick={() => SoundEngine.click()}
    >
      {children}
    </Link>
  );
}

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="bg-transparent border border-dg-border rounded-[3px] py-1 px-2 text-xs text-dg-text-secondary cursor-pointer transition-all duration-150 hover:border-dg-border-strong"
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
    >
      {theme === "dark" ? "\u2600" : "\u25CF"}
    </button>
  );
}

function SoundToggle() {
  const [on, setOn] = useState(true);

  useEffect(() => {
    setOn(SoundEngine.isEnabled());
  }, []);

  return (
    <button
      type="button"
      onClick={() => {
        const next = SoundEngine.toggle();
        setOn(next);
        if (next) SoundEngine.click();
      }}
      className="bg-transparent border border-dg-border rounded-[3px] py-1 px-2 text-xs cursor-pointer transition-all duration-150 hover:border-dg-border-strong"
      style={{ color: on ? "var(--color-dg-text-secondary)" : "var(--color-dg-text-tertiary)" }}
      aria-label={on ? "Mute sounds" : "Unmute sounds"}
      title={on ? "Mute sounds" : "Unmute sounds"}
    >
      {on ? "\uD83D\uDD0A" : "\uD83D\uDD07"}
    </button>
  );
}

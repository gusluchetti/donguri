import {
  Bookmark,
  MagnifyingGlass,
  Moon,
  SpeakerHigh,
  SpeakerNone,
  Sun,
  UserCircle,
} from "@phosphor-icons/react";
import { getSequenceManager } from "@tanstack/hotkeys";
import { HotkeysProvider, useHotkey } from "@tanstack/react-hotkeys";
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
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import "../app.css";
import { NavProgress } from "~/components/NavProgress";
import { getAuthState, logout } from "~/features/auth/auth.functions";
import { getCatalogFingerprint } from "~/features/catalog/catalog.functions";
import { trackedIdsOptions } from "~/features/catalog/catalog.queries";
import { SoundEngine } from "~/features/catalog/catalog.sound";
import { AcornIcon } from "~/features/media/components/AcornIcon";
import { BackgroundLayers } from "~/features/media/components/BackgroundLayers";
import { HelpOverlay } from "~/lib/hotkeys/HelpOverlay";
import { isInputFocused } from "~/lib/hotkeys/shortcuts";
import { ogTags, pageTitle } from "~/lib/og";
import { checkCatalogFreshness } from "~/lib/query";
import { getThemeCookie, ThemeProvider, useTheme } from "~/lib/theme";

// Sets data-theme before first paint. Also syncs the cookie for SSR on next visit.
const THEME_INIT_SCRIPT = `(function(){try{var p=localStorage.getItem('dg-theme-pref')||'system';var t=p==='system'?(window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'):p;document.documentElement.setAttribute('data-theme',t);document.cookie='dg-theme='+t+';path=/;max-age=34560000;samesite=lax'}catch(e){document.documentElement.setAttribute('data-theme','dark')}})()`;

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, maximum-scale=1" },
      { name: "theme-color", content: "#e8702e" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "mobile-web-app-capable", content: "yes" },
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
      { rel: "apple-touch-icon", href: "/icon-192.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "preconnect", href: "https://image.tmdb.org", crossOrigin: "anonymous" },
      { rel: "preconnect", href: "https://s4.anilist.co", crossOrigin: "anonymous" },
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

  const handleLogout = useCallback(async () => {
    await logout();
    queryClient.clear();
    clear();
    window.location.href = "/";
  }, [queryClient]);

  // Register service worker for PWA support
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

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
          <NavProgress />
          <div className="h-dvh overflow-hidden flex flex-col relative z-[2]">
            <nav
              className={`font-body shrink-0 sticky top-0 z-30 ${auth ? "hidden sm:block" : ""}`}
              style={{
                background: "var(--nav-bg)",
                backdropFilter: "blur(16px) saturate(1.3)",
                WebkitBackdropFilter: "blur(16px) saturate(1.3)",
                borderBottom: "1px solid var(--color-dg-border-subtle)",
                viewTransitionName: "nav",
              }}
            >
              <div className="max-w-[1100px] mx-auto px-3 sm:px-g3 flex items-center justify-between h-12">
                <div className="flex items-center gap-1 sm:gap-g1">
                  <Link
                    to="/"
                    className="flex items-center no-underline cursor-pointer text-dg-accent"
                    onClick={() => SoundEngine.click()}
                  >
                    <AcornIcon size={24} />
                  </Link>
                  {import.meta.env.DEV && (
                    <span className="text-[0.65rem] font-bold font-mono text-dg-movie tracking-wider bg-dg-movie/10 border border-dg-movie/30 rounded-sm px-1.5 py-0.5">
                      DEV
                    </span>
                  )}

                  <div className="hidden sm:flex items-center gap-1">
                    {NAV_ITEMS.map((item) => (
                      <NavButton key={item.to} to={item.to} exact={item.exact !== false}>
                        {item.label}
                      </NavButton>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  {auth ? (
                    <>
                      <Link
                        to="/profile"
                        className="text-xs text-dg-accent mr-2 no-underline hover:opacity-70 transition-opacity"
                        onClick={() => SoundEngine.click()}
                      >
                        {auth.authMethod === "atproto" ? `@${auth.handle}` : auth.handle}
                      </Link>
                      <div
                        className="mx-1"
                        style={{
                          width: 1,
                          height: 16,
                          background: "var(--color-dg-border)",
                        }}
                      />
                      <button
                        type="button"
                        className="bg-transparent border border-dg-border rounded-[3px] py-1 px-2 text-xs text-dg-text-tertiary font-body cursor-pointer transition-all duration-150 hover:border-dg-border-strong hover:text-dg-text-secondary"
                        onClick={handleLogout}
                      >
                        logout
                      </button>
                    </>
                  ) : (
                    <>
                      <SoundToggle />
                      <ThemeToggle />
                      <Link
                        to="/login"
                        className="hidden sm:inline text-xs text-dg-accent font-body no-underline border border-dg-accent/30 rounded-[3px] py-1 px-3 hover:border-dg-accent/60 transition-all duration-150"
                        onClick={() => SoundEngine.click()}
                      >
                        sign in
                      </Link>
                    </>
                  )}
                </div>
              </div>
            </nav>
            <Outlet />
            <footer className="hidden sm:block border-t border-dg-border-subtle px-g3 py-3 font-body shrink-0">
              <div className="max-w-[1100px] mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-[0.7rem] text-dg-text-tertiary">
                <span className="flex items-center gap-2">
                  <span>v2026.02.25-2</span>
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
            <BottomNav />
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

  useHotkey({ key: "?", shift: true }, () => setShowHelp((v) => !v));
  useHotkey(".", toggleTheme);

  // Use raw sequence manager so we can pass preventDefault: false.
  // The useHotkeySequence hook doesn't forward these options to the manager.
  const navRef = useRef(navigate);
  navRef.current = navigate;
  useEffect(() => {
    const opts = { preventDefault: false, stopPropagation: false } as const;
    const guard = (fn: () => void) => () => {
      if (isInputFocused()) return;
      fn();
    };
    const mgr = getSequenceManager();
    const unsubs = [
      mgr.register(
        ["G", "H"],
        guard(() => navRef.current({ to: "/" })),
        opts,
      ),
      mgr.register(
        ["G", "C"],
        guard(() => navRef.current({ to: "/catalog" })),
        opts,
      ),
      mgr.register(
        ["G", "R"],
        guard(() => navRef.current({ to: "/roadmap" })),
        opts,
      ),
      mgr.register(
        ["G", "P"],
        guard(() => navRef.current({ to: "/profile" })),
        opts,
      ),
    ];
    return () => {
      for (const u of unsubs) u();
    };
  }, []);

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
      className="no-underline font-body text-xs tracking-[0.06em] uppercase rounded-[3px] py-[5px] px-2 sm:px-3 transition-all duration-150 border relative active:scale-[0.97] active:opacity-70"
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
      className="bg-transparent border border-dg-border rounded-[3px] py-1.5 px-2.5 sm:py-1 sm:px-2 text-xs text-dg-text-secondary cursor-pointer transition-all duration-150 hover:border-dg-border-strong flex items-center"
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
    >
      {theme === "dark" ? <Sun size={13} weight="bold" /> : <Moon size={13} weight="bold" />}
    </button>
  );
}

function BottomNav() {
  const { auth } = Route.useLoaderData();
  const base =
    "flex-1 flex flex-col items-center justify-center gap-0.5 no-underline py-2 transition-colors duration-150 active:scale-95 active:opacity-60";
  const active = { className: `${base} text-dg-accent` };
  const inactive = { className: `${base} text-dg-text-tertiary` };

  if (!auth) return null;

  return (
    <nav
      className="sm:hidden shrink-0 border-t border-dg-border-subtle font-body z-30"
      style={{
        background: "var(--nav-bg)",
        backdropFilter: "blur(16px) saturate(1.3)",
        WebkitBackdropFilter: "blur(16px) saturate(1.3)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <div className="flex items-stretch h-14">
        <Link
          to="/catalog"
          activeOptions={{ exact: false }}
          activeProps={active}
          inactiveProps={inactive}
          onClick={() => SoundEngine.click()}
        >
          <MagnifyingGlass size={22} weight="bold" />
          <span className="text-[0.6rem] uppercase tracking-wider">catalog</span>
        </Link>

        <Link to="/" activeOptions={{ exact: true }} activeProps={active} inactiveProps={inactive}>
          <Bookmark size={22} weight="bold" />
          <span className="text-[0.6rem] uppercase tracking-wider">watchlist</span>
        </Link>

        <Link
          to="/profile"
          activeOptions={{ exact: true }}
          activeProps={active}
          inactiveProps={inactive}
          onClick={() => SoundEngine.click()}
        >
          <UserCircle size={22} weight="bold" />
          <span className="text-[0.6rem] uppercase tracking-wider">profile</span>
        </Link>
      </div>
    </nav>
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
      className="bg-transparent border border-dg-border rounded-[3px] py-1.5 px-2.5 sm:py-1 sm:px-2 text-xs cursor-pointer transition-all duration-150 hover:border-dg-border-strong flex items-center"
      style={{ color: on ? "var(--color-dg-text-secondary)" : "var(--color-dg-text-tertiary)" }}
      aria-label={on ? "Mute sounds" : "Unmute sounds"}
      title={on ? "Mute sounds" : "Unmute sounds"}
    >
      {on ? <SpeakerHigh size={13} weight="bold" /> : <SpeakerNone size={13} weight="bold" />}
    </button>
  );
}

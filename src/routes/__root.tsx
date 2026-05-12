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
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import {
  createRootRouteWithContext,
  type ErrorComponentProps,
  HeadContent,
  Link,
  Outlet,
  Scripts,
  useNavigate,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { clear } from "idb-keyval";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import type { SessionData } from "~/features/auth/auth.functions";
import "../app.css";
import { Button } from "~/components/Button";
import { IconButton } from "~/components/IconButton";
import { LinkButton } from "~/components/LinkButton";
import { NavProgress } from "~/components/NavProgress";
import { logout } from "~/features/auth/auth.functions";
import { authOptions, themeOptions } from "~/features/auth/auth.queries";
import { getCatalogFingerprint } from "~/features/catalog/catalog.functions";
import { trackedIdsOptions } from "~/features/catalog/catalog.queries";
import { SoundEngine } from "~/features/catalog/catalog.sound";
import { FeedbackDialog } from "~/features/feedback/FeedbackDialog";
import { AcornIcon } from "~/features/media/components/AcornIcon";
import { BackgroundLayers } from "~/features/media/components/BackgroundLayers";
import { HelpOverlay } from "~/lib/hotkeys/HelpOverlay";
import { isInputFocused } from "~/lib/hotkeys/shortcuts";
import { ogTags, pageTitle } from "~/lib/og";
import { checkCatalogFreshness } from "~/lib/query";
import { ThemeProvider, useTheme } from "~/lib/theme";

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 640px)");
    setIsDesktop(mql.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);
  return isDesktop;
}

// Sets data-theme before first paint. Also syncs the cookie for SSR on next visit.
const THEME_INIT_SCRIPT = `(function(){try{var p=localStorage.getItem('dg-theme-pref')||'system';var t=p==='system'?(window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'):p;document.documentElement.setAttribute('data-theme',t);document.cookie='dg-theme='+t+';path=/;max-age=34560000;samesite=lax'}catch(e){document.documentElement.setAttribute('data-theme','dark')}})()`;

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover",
      },
      { name: "theme-color", content: "#e8702e" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "donguri" },
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
      { rel: "manifest", href: "/manifest.json" },
      { rel: "apple-touch-icon", href: "/icon-180.png" },
      // Splash screens — light + dark per device
      // iPhone X/XS/11 Pro: 1125×2436
      {
        rel: "apple-touch-startup-image",
        href: "/apple-splash-dark-1125-2436.png",
        media:
          "(prefers-color-scheme: dark) and (device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3)",
      },
      {
        rel: "apple-touch-startup-image",
        href: "/apple-splash-light-1125-2436.png",
        media:
          "(prefers-color-scheme: light) and (device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3)",
      },
      // iPhone 12/13/14/15: 1170×2532
      {
        rel: "apple-touch-startup-image",
        href: "/apple-splash-dark-1170-2532.png",
        media:
          "(prefers-color-scheme: dark) and (device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)",
      },
      {
        rel: "apple-touch-startup-image",
        href: "/apple-splash-light-1170-2532.png",
        media:
          "(prefers-color-scheme: light) and (device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)",
      },
      // iPhone 14/15 Plus: 1284×2778
      {
        rel: "apple-touch-startup-image",
        href: "/apple-splash-dark-1284-2778.png",
        media:
          "(prefers-color-scheme: dark) and (device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3)",
      },
      {
        rel: "apple-touch-startup-image",
        href: "/apple-splash-light-1284-2778.png",
        media:
          "(prefers-color-scheme: light) and (device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3)",
      },
      // iPhone 14/15 Pro: 1179×2556
      {
        rel: "apple-touch-startup-image",
        href: "/apple-splash-dark-1179-2556.png",
        media:
          "(prefers-color-scheme: dark) and (device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3)",
      },
      {
        rel: "apple-touch-startup-image",
        href: "/apple-splash-light-1179-2556.png",
        media:
          "(prefers-color-scheme: light) and (device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3)",
      },
      // iPhone 14/15 Pro Max: 1290×2796
      {
        rel: "apple-touch-startup-image",
        href: "/apple-splash-dark-1290-2796.png",
        media:
          "(prefers-color-scheme: dark) and (device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3)",
      },
      {
        rel: "apple-touch-startup-image",
        href: "/apple-splash-light-1290-2796.png",
        media:
          "(prefers-color-scheme: light) and (device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3)",
      },
      // iPad mini/Air: 1536×2048
      {
        rel: "apple-touch-startup-image",
        href: "/apple-splash-dark-1536-2048.png",
        media:
          "(prefers-color-scheme: dark) and (device-width: 768px) and (device-height: 1024px) and (-webkit-device-pixel-ratio: 2)",
      },
      {
        rel: "apple-touch-startup-image",
        href: "/apple-splash-light-1536-2048.png",
        media:
          "(prefers-color-scheme: light) and (device-width: 768px) and (device-height: 1024px) and (-webkit-device-pixel-ratio: 2)",
      },
      // iPad Pro 11": 1668×2388
      {
        rel: "apple-touch-startup-image",
        href: "/apple-splash-dark-1668-2388.png",
        media:
          "(prefers-color-scheme: dark) and (device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2)",
      },
      {
        rel: "apple-touch-startup-image",
        href: "/apple-splash-light-1668-2388.png",
        media:
          "(prefers-color-scheme: light) and (device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2)",
      },
      // iPad Pro 12.9": 2048×2732
      {
        rel: "apple-touch-startup-image",
        href: "/apple-splash-dark-2048-2732.png",
        media:
          "(prefers-color-scheme: dark) and (device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2)",
      },
      {
        rel: "apple-touch-startup-image",
        href: "/apple-splash-light-2048-2732.png",
        media:
          "(prefers-color-scheme: light) and (device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2)",
      },
      { rel: "preconnect", href: "https://image.tmdb.org", crossOrigin: "anonymous" },
      { rel: "preconnect", href: "https://s4.anilist.co", crossOrigin: "anonymous" },
      { rel: "preconnect", href: "https://images.igdb.com", crossOrigin: "anonymous" },
    ],
  }),
  beforeLoad: async ({ context }) => {
    const [auth, theme] = await Promise.all([
      context.queryClient.ensureQueryData(authOptions()),
      context.queryClient.ensureQueryData(themeOptions()),
    ]);
    return { auth: auth as SessionData | null, theme };
  },
  loader: async ({ context }) => {
    let trackedIds: Record<string, string | null> = {};
    if (context.auth) {
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
    return { trackedIds };
  },
  staleTime: 5 * 60 * 1000,
  component: RootComponent,
  errorComponent: RootError,
  notFoundComponent: NotFound,
});

function RootDocument({ children, theme }: { children: ReactNode; theme: string }) {
  return (
    <html lang="en" data-theme={theme} suppressHydrationWarning>
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: static inline script for theme init before paint */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <HeadContent />
      </head>
      <body className="font-body bg-dg-bg m-0 p-0">
        <BackgroundLayers />
        {children}
        <Scripts />
      </body>
    </html>
  );
}

const NAV_ITEMS: readonly { to: string; label: string; exact?: boolean }[] = [
  { to: "/catalog", label: "catalog", exact: false },
  { to: "/news", label: "news", exact: false },
];

function RootComponent() {
  const { auth, theme, queryClient } = Route.useRouteContext();

  const handleLogout = useCallback(async () => {
    await logout();
    queryClient.clear();
    clear();
    window.location.href = "/";
  }, [queryClient]);

  // Register service worker for PWA support + enable CSS :active on iOS Safari
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    document.addEventListener("touchstart", () => {}, { passive: true });
  }, []);

  // Warm up audio engine on first user gesture (pre-renders all sound buffers)
  useEffect(() => {
    const warmup = () => {
      SoundEngine.init();
      document.removeEventListener("pointerdown", warmup, true);
      document.removeEventListener("keydown", warmup, true);
    };
    document.addEventListener("pointerdown", warmup, { capture: true });
    document.addEventListener("keydown", warmup, { capture: true });
    return () => {
      document.removeEventListener("pointerdown", warmup, true);
      document.removeEventListener("keydown", warmup, true);
    };
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
  const [showFeedback, setShowFeedback] = useState(false);
  const isDesktop = useIsDesktop();

  useEffect(() => {
    if (import.meta.env.DEV && isDesktop) import("react-grab");
  }, [isDesktop]);

  return (
    <RootDocument theme={theme}>
      <ThemeProvider initialTheme={theme} queryClient={queryClient}>
        <HotkeysProvider>
          <GlobalShortcuts showHelp={showHelp} setShowHelp={setShowHelp} />
          <NavProgress />
          <div
            className="h-svh overflow-hidden flex flex-col relative z-[2]"
            style={{ paddingTop: "env(safe-area-inset-top)" }}
          >
            <nav
              className={`font-body shrink-0 sticky top-0 z-30 ${auth ? "hidden sm:block" : ""}`}
              style={{
                background: "var(--nav-bg)",
                backdropFilter: "blur(16px) saturate(1.3)",
                WebkitBackdropFilter: "blur(16px) saturate(1.3)",
                borderBottom: "1px solid var(--color-dg-border-subtle)",
              }}
            >
              <div
                className="max-w-[1100px] mx-auto px-g2 sm:px-g3 flex items-center justify-between h-12"
                style={{
                  paddingLeft: "max(var(--spacing-g2), env(safe-area-inset-left))",
                  paddingRight: "max(var(--spacing-g2), env(safe-area-inset-right))",
                }}
              >
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
                    {auth && (
                      <button
                        type="button"
                        onClick={() => setShowFeedback(true)}
                        className="dg-press no-underline font-body text-xs tracking-[0.06em] uppercase rounded-sm py-[5px] px-2 sm:px-3 border bg-transparent border-transparent text-dg-text-secondary"
                      >
                        feedback
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  {auth ? (
                    <>
                      <Link
                        to="/profile"
                        className="text-xs text-dg-accent mr-2 no-underline hover:text-dg-accent transition-colors"
                        onClick={() => SoundEngine.click()}
                      >
                        {auth.authMethod === "atproto" ? `@${auth.handle}` : auth.handle}
                      </Link>
                      <div className="mx-1 w-px h-4 bg-dg-border" />
                      <Button variant="ghost" size="compact" onClick={handleLogout}>
                        logout
                      </Button>
                    </>
                  ) : (
                    <>
                      <SoundToggle />
                      <ThemeToggle />
                      <LinkButton
                        to="/login"
                        variant="accent"
                        size="compact"
                        className="hidden sm:inline-flex"
                        onClick={() => SoundEngine.click()}
                      >
                        sign in
                      </LinkButton>
                    </>
                  )}
                </div>
              </div>
            </nav>
            <Outlet />
            <footer className="hidden sm:block border-t border-dg-border-subtle px-g3 py-g1 font-body shrink-0">
              <div className="max-w-[1100px] mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-[0.7rem] text-dg-text-tertiary">
                <span className="flex items-center gap-2">
                  <span>v2026.05.09</span>
                  <button
                    type="button"
                    onClick={() => setShowHelp(true)}
                    className="dg-press text-dg-text-tertiary hover:text-dg-text-secondary bg-transparent border-none font-body p-0 text-[0.7rem]"
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
        {auth && showFeedback && <FeedbackDialog onClose={() => setShowFeedback(false)} />}
      </ThemeProvider>
      {import.meta.env.DEV && isDesktop && (
        <>
          <ReactQueryDevtools buttonPosition="bottom-left" />
          <TanStackRouterDevtools position="bottom-right" />
        </>
      )}
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
        ["G", "N"],
        guard(() => navRef.current({ to: "/news" })),
        opts,
      ),
      mgr.register(
        ["G", "P"],
        guard(() => navRef.current({ to: "/profile" })),
        opts,
      ),
    ];
    return () => {
      for (const u of unsubs) u.unregister();
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
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
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
              <Button variant="accent" onClick={reset}>
                Try again
              </Button>
              <a
                href="/"
                className="dg-press inline-flex items-center justify-center font-body text-[0.85rem] text-dg-text-secondary no-underline py-2 px-4 border border-dg-border-subtle rounded-sm"
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
    <div className="dg-page-enter text-dg-text flex-1 overflow-y-auto font-body flex items-center justify-center">
      <div className="text-center px-4 py-16">
        <p className="font-display text-[2rem] font-normal text-dg-accent mb-2">404</p>
        <p className="text-[0.9rem] text-dg-text-secondary mb-6">Page not found.</p>
        <LinkButton to="/" variant="accent">
          Go home
        </LinkButton>
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
      className="dg-press no-underline font-body text-xs tracking-[0.06em] uppercase rounded-sm py-[5px] px-2 sm:px-3 border relative"
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
    <IconButton
      size="nav"
      variant="ghost"
      onClick={toggleTheme}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
    >
      {theme === "dark" ? <Sun size={13} weight="bold" /> : <Moon size={13} weight="bold" />}
    </IconButton>
  );
}

function BottomNav() {
  const { auth } = Route.useRouteContext();
  const base =
    "flex-1 flex flex-col items-center justify-center gap-0.5 no-underline py-2 transition-colors duration-50 active:scale-95 active:opacity-80";
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
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
      }}
    >
      <div className="flex items-stretch h-12 px-2">
        <Link
          to="/catalog"
          activeOptions={{ exact: false }}
          activeProps={active}
          inactiveProps={inactive}
          onClick={() => SoundEngine.click()}
        >
          <MagnifyingGlass size={22} weight="bold" />
          <span className="text-[0.625rem] uppercase tracking-wider">catalog</span>
        </Link>

        <Link
          to="/"
          activeOptions={{ exact: true }}
          activeProps={active}
          inactiveProps={inactive}
          onClick={() => SoundEngine.click()}
        >
          <Bookmark size={22} weight="bold" />
          <span className="text-[0.625rem] uppercase tracking-wider">watchlist</span>
        </Link>

        <Link
          to="/profile"
          activeOptions={{ exact: true }}
          activeProps={active}
          inactiveProps={inactive}
          onClick={() => SoundEngine.click()}
        >
          <UserCircle size={22} weight="bold" />
          <span className="text-[0.625rem] uppercase tracking-wider">profile</span>
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
    <IconButton
      size="nav"
      variant="ghost"
      onClick={() => {
        const next = SoundEngine.toggle();
        setOn(next);
        if (next) SoundEngine.toggleOn();
      }}
      style={{ color: on ? "var(--color-dg-text-secondary)" : "var(--color-dg-text-tertiary)" }}
      aria-label={on ? "Mute sounds" : "Unmute sounds"}
      title={on ? "Mute sounds" : "Unmute sounds"}
    >
      {on ? <SpeakerHigh size={13} weight="bold" /> : <SpeakerNone size={13} weight="bold" />}
    </IconButton>
  );
}

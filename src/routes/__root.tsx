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
import { Moon, Sun } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import "../styles/global.css";
import { getAuthState, logout } from "../lib/auth.functions";
import { getCatalogFingerprint } from "../lib/catalog.functions";
import { HelpOverlay } from "../lib/hotkeys/HelpOverlay";
import { isInputFocused } from "../lib/hotkeys/shortcuts";
import { ogTags, pageTitle } from "../lib/og";
import { checkCatalogFreshness } from "../lib/query";
import { trackedIdsOptions } from "../lib/query-options";
import { getThemeCookie, ThemeProvider, useTheme } from "../lib/theme";
import styles from "./__root.module.css";

const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('dg-theme');if(!t){t=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'}document.documentElement.setAttribute('data-theme',t);document.cookie='dg-theme='+t+';path=/;max-age=34560000;samesite=lax'}catch(e){document.documentElement.setAttribute('data-theme','dark')}})()`;

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, maximum-scale=1" },
      { name: "theme-color", content: "#00E5CC" },
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
      { rel: "icon", href: "/favicon.ico" },
      { rel: "manifest", href: "/manifest.json" },
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
      <body>
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

  const [showHelp, setShowHelp] = useState(false);

  // ─── Tron dev grid toggle (Shift+G) ──────────────────────────────────
  const toggleGrid = useCallback(() => {
    if (!import.meta.env.DEV) return;
    const html = document.documentElement;
    if (html.hasAttribute("data-grid")) {
      html.removeAttribute("data-grid");
      localStorage.removeItem("dg-dev-grid");
    } else {
      html.setAttribute("data-grid", "");
      localStorage.setItem("dg-dev-grid", "1");
    }
  }, []);

  // Restore grid on mount (dev only)
  useEffect(() => {
    if (import.meta.env.DEV && localStorage.getItem("dg-dev-grid")) {
      document.documentElement.setAttribute("data-grid", "");
    }
  }, []);

  return (
    <RootDocument theme={theme}>
      <ThemeProvider initialTheme={theme}>
        <HotkeysProvider>
          <GlobalShortcuts showHelp={showHelp} setShowHelp={setShowHelp} toggleGrid={toggleGrid} />
          <div className={styles.shell}>
            <nav className={styles.nav}>
              <div className={styles.navInner}>
                {NAV_LINKS.map((link) =>
                  link.accent ? (
                    <Link
                      key={link.to}
                      to={link.to}
                      activeOptions={{ exact: link.exact !== false }}
                      className={styles.navLinkBrand}
                    >
                      {link.label}
                    </Link>
                  ) : (
                    <Link
                      key={link.to}
                      to={link.to}
                      activeOptions={{ exact: link.exact !== false }}
                      className={styles.navLink}
                      activeProps={{ "data-active": "" } as Record<string, string>}
                    >
                      {link.label}
                    </Link>
                  ),
                )}
                <div className={styles.navRight}>
                  <ThemeToggle />
                  {auth ? (
                    <>
                      <span className={styles.handle}>
                        {auth.authMethod === "atproto" ? `@${auth.handle}` : auth.handle}
                      </span>
                      <button
                        type="button"
                        className={styles.logoutBtn}
                        onClick={async () => {
                          await logout();
                          queryClient.clear();
                          clear();
                          window.location.href = "/";
                        }}
                      >
                        logout
                      </button>
                    </>
                  ) : (
                    <Link to="/" className={styles.loginLink}>
                      login
                    </Link>
                  )}
                </div>
              </div>
            </nav>
            <Outlet />
            <footer className={styles.footer}>
              <div className={styles.footerInner}>
                <span className={styles.footerLeft}>
                  <span>v0.3.0</span>
                  <button
                    type="button"
                    onClick={() => setShowHelp(true)}
                    className={styles.shortcutsBtn}
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
                    className={styles.footerLink}
                  >
                    Wikidata
                  </a>
                  {" \u00b7 "}
                  <a
                    href="https://www.themoviedb.org"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.footerLink}
                  >
                    TMDB
                  </a>
                  {" \u00b7 "}
                  <a
                    href="https://www.tvmaze.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.footerLink}
                  >
                    TVMaze
                  </a>
                  {" \u00b7 "}
                  <a
                    href="https://github.com/manami-project/anime-offline-database"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.footerLink}
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
  toggleGrid,
}: {
  showHelp: boolean;
  setShowHelp: React.Dispatch<React.SetStateAction<boolean>>;
  toggleGrid: () => void;
}) {
  const navigate = useNavigate();
  const { toggleTheme } = useTheme();

  useHotkey({ key: "?", shift: true }, () => setShowHelp((v) => !v));
  useHotkey(".", toggleTheme);

  // Shift+G — toggle dev grid
  useHotkey({ key: "G", shift: true }, toggleGrid);

  useHotkeySequence(["G", "H"], () => {
    if (isInputFocused()) return;
    navigate({ to: "/" });
  });

  useHotkeySequence(["G", "C"], () => {
    if (isInputFocused()) return;
    navigate({ to: "/catalog" });
  });

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
      <body className={styles.errorBody}>
        <div className={styles.errorPage}>
          <div className={styles.errorCenter}>
            <p className={styles.errorTitle}>error</p>
            <p className={styles.errorMsg}>Something went wrong.</p>
            <div className={styles.errorActions}>
              <button type="button" onClick={reset} className={styles.errorRetry}>
                Try again
              </button>
              <a href="/" className={styles.errorHome}>
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
    <div className={styles.notFound}>
      <div className={styles.notFoundCenter}>
        <p className={styles.notFoundTitle}>404</p>
        <p className={styles.notFoundMsg}>Page not found.</p>
        <Link to="/" className={styles.notFoundLink}>
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
      className={styles.themeBtn}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
    >
      <Icon size={16} />
    </button>
  );
}

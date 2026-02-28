import type { QueryClient } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { themeOptions } from "~/features/auth/auth.queries";

export type ThemePreference = "system" | "dark" | "light";
type ResolvedTheme = "dark" | "light";

interface ThemeContextValue {
  preference: ThemePreference;
  theme: ResolvedTheme;
  setThemePreference: (p: ThemePreference) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  preference: "system",
  theme: "dark",
  setThemePreference: () => {},
  toggleTheme: () => {},
});

function resolveTheme(pref: ThemePreference): ResolvedTheme {
  if (pref !== "system") return pref;
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function applyTheme(resolved: ResolvedTheme) {
  document.documentElement.setAttribute("data-theme", resolved);
  // biome-ignore lint/suspicious/noDocumentCookie: Cookie Store API lacks Firefox/Safari support
  document.cookie = `dg-theme=${resolved};path=/;max-age=${60 * 60 * 24 * 400};samesite=lax`;
}

export const getThemeCookie = createServerFn({ method: "GET" }).handler(async () => {
  const { getCookie } = await import("@tanstack/react-start/server");
  const value = getCookie("dg-theme");
  if (value === "light" || value === "dark") return value;
  return "dark" as ResolvedTheme;
});

export function ThemeProvider({
  children,
  initialTheme = "dark",
  queryClient,
}: {
  children: React.ReactNode;
  initialTheme?: ResolvedTheme;
  queryClient?: QueryClient;
}) {
  const [preference, setPreference] = useState<ThemePreference>(() => {
    if (typeof window === "undefined") return "system";
    return (localStorage.getItem("dg-theme-pref") as ThemePreference) ?? "system";
  });
  const [theme, setTheme] = useState<ResolvedTheme>(initialTheme);

  const setThemePreference = useCallback(
    (p: ThemePreference) => {
      setPreference(p);
      localStorage.setItem("dg-theme-pref", p);
      const resolved = resolveTheme(p);
      setTheme(resolved);
      applyTheme(resolved);
      queryClient?.setQueryData(themeOptions().queryKey, resolved);
    },
    [queryClient],
  );

  // Cycles dark → light → system
  const toggleTheme = useCallback(() => {
    const next: ThemePreference =
      preference === "dark" ? "light" : preference === "light" ? "system" : "dark";
    setThemePreference(next);
  }, [preference, setThemePreference]);

  // Listen for OS preference changes when preference is "system"
  useEffect(() => {
    if (preference !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const handler = (e: MediaQueryListEvent) => {
      const resolved = e.matches ? "light" : "dark";
      setTheme(resolved);
      applyTheme(resolved);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [preference]);

  return (
    <ThemeContext.Provider value={{ preference, theme, setThemePreference, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

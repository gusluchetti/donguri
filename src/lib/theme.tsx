import { createServerFn } from "@tanstack/react-start";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

type Theme = "dark" | "light";
export type ThemePreference = "dark" | "light" | "system";

interface ThemeContextValue {
  theme: Theme;
  preference: ThemePreference;
  toggleTheme: () => void;
  setThemePreference: (pref: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  preference: "dark",
  toggleTheme: () => {},
  setThemePreference: () => {},
});

export const getThemeCookie = createServerFn({ method: "GET" }).handler(async () => {
  const { getCookie } = await import("@tanstack/react-start/server");
  const value = getCookie("dg-theme");
  if (value === "light" || value === "dark") return value;
  return "dark" as Theme;
});

export function ThemeProvider({
  children,
  initialTheme = "dark",
}: {
  children: React.ReactNode;
  initialTheme?: Theme;
}) {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [preference, setPreferenceState] = useState<ThemePreference>(initialTheme);
  const transitionTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Hydrate preference from localStorage on mount
  useEffect(() => {
    const pref = localStorage.getItem("dg-theme-pref");
    if (pref === "dark" || pref === "light" || pref === "system") {
      setPreferenceState(pref);
    } else if (localStorage.getItem("dg-theme")) {
      // Legacy: had a manual theme but no preference key
      setPreferenceState(localStorage.getItem("dg-theme") as ThemePreference);
    }
  }, []);

  const applyTheme = useCallback((resolved: Theme) => {
    clearTimeout(transitionTimer.current);
    document.documentElement.classList.add("theme-transition");
    document.documentElement.setAttribute("data-theme", resolved);
    // biome-ignore lint/suspicious/noDocumentCookie: Cookie Store API lacks Firefox/Safari support
    document.cookie = `dg-theme=${resolved};path=/;max-age=${60 * 60 * 24 * 400};samesite=lax`;
    setTheme(resolved);
    transitionTimer.current = setTimeout(() => {
      document.documentElement.classList.remove("theme-transition");
    }, 250);
  }, []);

  const setThemePreference = useCallback(
    (pref: ThemePreference) => {
      setPreferenceState(pref);
      localStorage.setItem("dg-theme-pref", pref);
      if (pref === "system") {
        localStorage.removeItem("dg-theme");
        const resolved = window.matchMedia("(prefers-color-scheme: light)").matches
          ? "light"
          : "dark";
        applyTheme(resolved);
      } else {
        localStorage.setItem("dg-theme", pref);
        applyTheme(pref);
      }
    },
    [applyTheme],
  );

  const toggleTheme = useCallback(() => {
    const next = theme === "dark" ? "light" : "dark";
    setThemePreference(next);
  }, [theme, setThemePreference]);

  // Listen for OS preference changes when no manual preference is saved
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const handler = (e: MediaQueryListEvent) => {
      if (localStorage.getItem("dg-theme")) return; // manual preference takes priority
      const next = e.matches ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      setTheme(next);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, preference, toggleTheme, setThemePreference }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

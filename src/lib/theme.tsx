import { createServerFn } from "@tanstack/react-start";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

type Theme = "dark" | "light";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  toggleTheme: () => {},
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
  const transitionTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const toggleTheme = useCallback(() => {
    const next = theme === "dark" ? "light" : "dark";

    // Enable transition
    clearTimeout(transitionTimer.current);
    document.documentElement.classList.add("theme-transition");
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("dg-theme", next);
    // biome-ignore lint/suspicious/noDocumentCookie: Cookie Store API lacks Firefox/Safari support
    document.cookie = `dg-theme=${next};path=/;max-age=${60 * 60 * 24 * 400};samesite=lax`;
    setTheme(next);

    // Remove transition class after animation completes
    transitionTimer.current = setTimeout(() => {
      document.documentElement.classList.remove("theme-transition");
    }, 250);
  }, [theme]);

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

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}

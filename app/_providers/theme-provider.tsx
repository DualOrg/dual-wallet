"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";

type Theme = "light" | "dark";
interface ThemeValue {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeValue | undefined>(undefined);
const themeEvent = "viewer-theme-change";

function subscribe(callback: () => void) {
  window.addEventListener(themeEvent, callback);
  return () => window.removeEventListener(themeEvent, callback);
}

function currentTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function serverTheme(): Theme {
  return "light";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(subscribe, currentTheme, serverTheme);

  useEffect(() => {
    const saved = localStorage.getItem("viewer-theme");
    const next = saved === "dark" || saved === "light" ? saved : "light";
    document.documentElement.classList.toggle("dark", next === "dark");
    window.dispatchEvent(new Event(themeEvent));
  }, []);

  const value = useMemo<ThemeValue>(
    () => ({
      theme,
      toggleTheme: () => {
        const next = currentTheme() === "dark" ? "light" : "dark";
        document.documentElement.classList.toggle("dark", next === "dark");
        localStorage.setItem("viewer-theme", next);
        window.dispatchEvent(new Event(themeEvent));
      },
    }),
    [theme],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used within ThemeProvider");
  return value;
}

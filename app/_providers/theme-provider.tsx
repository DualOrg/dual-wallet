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
const storageKey = "viewer-theme";

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

function applyTheme(next: Theme) {
  document.documentElement.classList.toggle("dark", next === "dark");
  window.dispatchEvent(new Event(themeEvent));
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // The pre-hydration script in the root layout has already applied the stored
  // or system theme, so the first client snapshot is the real one.
  const theme = useSyncExternalStore(subscribe, currentTheme, serverTheme);

  // Follow the operating system until the user makes an explicit choice.
  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (localStorage.getItem(storageKey)) return;
      applyTheme(query.matches ? "dark" : "light");
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const value = useMemo<ThemeValue>(
    () => ({
      theme,
      toggleTheme: () => {
        const next = currentTheme() === "dark" ? "light" : "dark";
        localStorage.setItem(storageKey, next);
        applyTheme(next);
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

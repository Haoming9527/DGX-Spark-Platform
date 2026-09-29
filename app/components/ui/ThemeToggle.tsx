"use client";

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

export type ThemeMode = "light" | "dark";

type ThemeContextValue = {
  theme: ThemeMode;
  setTheme: (mode: ThemeMode) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = "dgx-theme";

function applyTheme(mode: ThemeMode) {
  document.documentElement.setAttribute("data-theme", mode);
  document.documentElement.style.colorScheme = mode;
}

function readInitialTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {}
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function themeSnapshot(): ThemeMode {
  const current = document.documentElement.getAttribute("data-theme");
  return current === "light" || current === "dark" ? current : readInitialTheme();
}

function subscribeTheme(notify: () => void) {
  if (!document.documentElement.hasAttribute("data-theme")) applyTheme(readInitialTheme());
  const syncStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    applyTheme(readInitialTheme());
    notify();
  };
  window.addEventListener("storage", syncStorage);
  window.addEventListener("dgx-theme-change", notify);
  return () => {
    window.removeEventListener("storage", syncStorage);
    window.removeEventListener("dgx-theme-change", notify);
  };
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore<ThemeMode>(subscribeTheme, themeSnapshot, () => "light");

  const setTheme = useCallback((mode: ThemeMode) => {
    applyTheme(mode);
    try { window.localStorage.setItem(STORAGE_KEY, mode); } catch {}
    window.dispatchEvent(new Event("dgx-theme-change"));
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [setTheme, theme]);

  const value = useMemo(
    () => ({ theme, setTheme, toggleTheme }),
    [theme, setTheme, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`sticker-sm inline-flex h-9 w-9 items-center justify-center text-foreground transition-[filter] hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nvidia-green ${className}`}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark ? (
        <Sun className="h-4 w-4 text-[#f5c518]" strokeWidth={2.25} fill="currentColor" fillOpacity={0.25} />
      ) : (
        <Moon className="h-4 w-4 text-[#6366f1]" strokeWidth={2.25} fill="currentColor" fillOpacity={0.2} />
      )}
    </button>
  );
}

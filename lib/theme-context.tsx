"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark";
const ThemeContext = createContext<{ theme: Theme; toggle: () => void } | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");

  const apply = useCallback((next: Theme) => {
    document.documentElement.classList.toggle("dark", next === "dark");
    document.documentElement.style.colorScheme = next;
    setTheme(next);
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem("sentinel-theme");
    const initial = stored === "dark" || (!stored && matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light";
    document.documentElement.classList.toggle("dark", initial === "dark");
    document.documentElement.style.colorScheme = initial;
    const initialization = window.setTimeout(() => setTheme(initial), 0);
    const sync = (event: StorageEvent) => {
      if (event.key === "sentinel-theme" && (event.newValue === "light" || event.newValue === "dark")) apply(event.newValue);
    };
    window.addEventListener("storage", sync);
    return () => {
      window.clearTimeout(initialization);
      window.removeEventListener("storage", sync);
    };
  }, [apply]);

  const toggle = useCallback(() => {
    const next = theme === "dark" ? "light" : "dark";
    localStorage.setItem("sentinel-theme", next);
    apply(next);
  }, [apply, theme]);

  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used within ThemeProvider");
  return value;
}

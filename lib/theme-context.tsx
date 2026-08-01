"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type Theme = "light" | "dark";
export type ThemeMode = "system" | "light" | "dark" | "scheduled";
export type ThemeSchedule = { darkFrom: string; lightFrom: string };

const STORAGE_KEY = "sentinel-theme-settings";
const DEFAULT_SCHEDULE: ThemeSchedule = { darkFrom: "20:00", lightFrom: "06:00" };

type ThemeSettings = { mode: ThemeMode; schedule: ThemeSchedule };
type ThemeContextValue = ThemeSettings & {
  theme: Theme;
  setMode: (mode: ThemeMode) => void;
  setSchedule: (schedule: ThemeSchedule) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function minutes(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

export function scheduledTheme(schedule: ThemeSchedule, now = new Date()): Theme {
  const current = now.getHours() * 60 + now.getMinutes();
  const darkFrom = minutes(schedule.darkFrom);
  const lightFrom = minutes(schedule.lightFrom);
  const dark =
    darkFrom === lightFrom
      ? true
      : darkFrom > lightFrom
        ? current >= darkFrom || current < lightFrom
        : current >= darkFrom && current < lightFrom;
  return dark ? "dark" : "light";
}

function resolveTheme(mode: ThemeMode, schedule: ThemeSchedule): Theme {
  if (mode === "light" || mode === "dark") return mode;
  if (mode === "scheduled") return scheduledTheme(schedule);
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function storedSettings(): ThemeSettings {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") as Partial<ThemeSettings> | null;
    const mode =
      stored?.mode === "light" || stored?.mode === "dark" || stored?.mode === "scheduled" || stored?.mode === "system"
        ? stored.mode
        : "dark";
    const schedule =
      stored?.schedule?.darkFrom && stored.schedule.lightFrom
        ? stored.schedule as ThemeSchedule
        : DEFAULT_SCHEDULE;
    return { mode, schedule };
  } catch {
    return { mode: "dark", schedule: DEFAULT_SCHEDULE };
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("dark");
  const [schedule, setScheduleState] = useState<ThemeSchedule>(DEFAULT_SCHEDULE);
  const [theme, setTheme] = useState<Theme>("dark");

  const apply = useCallback((nextMode: ThemeMode, nextSchedule: ThemeSchedule) => {
    const nextTheme = resolveTheme(nextMode, nextSchedule);
    document.documentElement.classList.toggle("dark", nextTheme === "dark");
    document.documentElement.style.colorScheme = nextTheme;
    setTheme(nextTheme);
  }, []);

  const persist = useCallback((nextMode: ThemeMode, nextSchedule: ThemeSchedule) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode: nextMode, schedule: nextSchedule }));
  }, []);

  const setMode = useCallback((nextMode: ThemeMode) => {
    setModeState(nextMode);
    setScheduleState((currentSchedule) => {
      persist(nextMode, currentSchedule);
      apply(nextMode, currentSchedule);
      return currentSchedule;
    });
  }, [apply, persist]);

  const setSchedule = useCallback((nextSchedule: ThemeSchedule) => {
    setScheduleState(nextSchedule);
    setModeState((currentMode) => {
      persist(currentMode, nextSchedule);
      apply(currentMode, nextSchedule);
      return currentMode;
    });
  }, [apply, persist]);

  useEffect(() => {
    const initial = storedSettings();
    const initialization = window.setTimeout(() => {
      setModeState(initial.mode);
      setScheduleState(initial.schedule);
      apply(initial.mode, initial.schedule);
    }, 0);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const refresh = () => {
      const current = storedSettings();
      apply(current.mode, current.schedule);
    };
    const sync = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      const next = storedSettings();
      setModeState(next.mode);
      setScheduleState(next.schedule);
      apply(next.mode, next.schedule);
    };
    media.addEventListener("change", refresh);
    window.addEventListener("storage", sync);
    const timer = window.setInterval(refresh, 30_000);
    return () => {
      window.clearTimeout(initialization);
      window.clearInterval(timer);
      media.removeEventListener("change", refresh);
      window.removeEventListener("storage", sync);
    };
  }, [apply]);

  return (
    <ThemeContext.Provider value={{ mode, schedule, theme, setMode, setSchedule }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used within ThemeProvider");
  return value;
}

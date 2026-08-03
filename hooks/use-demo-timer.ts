"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type DemoSessionState = {
  elapsedMs: number;
  isRunning: boolean;
  projectName: string;
  start: () => void;
  stop: () => void;
};

export function useDemoTimer(): DemoSessionState {
  const [startedAt, setStartedAt] = useState<number>(() => Date.now());
  const [isRunning, setIsRunning] = useState(false);
  const [projectName, setProjectName] = useState("Demo project");
  const [elapsedMs, setElapsedMs] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const tick = useCallback(() => {
    setElapsedMs(Date.now() - startedAt);
  }, [startedAt]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/demo-session")
      .then((res) => res.json())
      .then((data: { startedAt?: string; projectName?: string; isRunning?: boolean }) => {
        if (cancelled) return;
        if (data.startedAt) setStartedAt(new Date(data.startedAt).getTime());
        if (data.projectName) setProjectName(data.projectName);
        if (data.isRunning) {
          setIsRunning(true);
          setElapsedMs(Date.now() - new Date(data.startedAt ?? Date.now()).getTime());
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(tick, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning, tick]);

  const start = useCallback(() => {
    const now = Date.now();
    setStartedAt(now);
    setElapsedMs(0);
    setIsRunning(true);
  }, []);

  const stop = useCallback(() => {
    setIsRunning(false);
    setElapsedMs(0);
  }, []);

  return { elapsedMs, isRunning, projectName, start, stop };
}
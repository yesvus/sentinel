import { useEffect, useRef, useState } from "react";

type HomeRailVisibilityOptions = {
  isRunning: boolean;
  isMobile: boolean;
  setSidebarOpen: (open: boolean) => void;
  setMobileSidebarOpen: (open: boolean) => void;
};

export function useHomeRailVisibility({
  isRunning,
  isMobile,
  setSidebarOpen,
  setMobileSidebarOpen,
}: HomeRailVisibilityOptions) {
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);
  const wasRunningRef = useRef(isRunning);

  useEffect(() => {
    if (!isRunning) {
      wasRunningRef.current = false;
      const showTimer = window.setTimeout(() => {
        setVisible(true);
        setExiting(false);
      }, 0);
      return () => window.clearTimeout(showTimer);
    }

    const justStarted = !wasRunningRef.current;
    wasRunningRef.current = true;
    if (justStarted) {
      if (isMobile) setMobileSidebarOpen(false);
      else setSidebarOpen(false);
    }
    if (!visible) return;

    let hideTimer: number | null = null;
    const exitTimer = window.setTimeout(() => {
      setExiting(true);
      hideTimer = window.setTimeout(() => setVisible(false), 260);
    }, 0);
    return () => {
      window.clearTimeout(exitTimer);
      if (hideTimer) window.clearTimeout(hideTimer);
    };
    // Sidebar setters change identity with sidebar state; reopening mid-session must remain possible.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile, isRunning]);

  return { visible, exiting };
}

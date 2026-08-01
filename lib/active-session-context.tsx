"use client";

import { createContext, useContext } from "react";
import type { StudySession } from "@/lib/api";

const ActiveSessionContext = createContext<{ activeSession: StudySession | null } | null>(null);

export function ActiveSessionProvider({
  activeSession,
  children,
}: {
  activeSession: StudySession | null;
  children: React.ReactNode;
}) {
  return (
    <ActiveSessionContext.Provider value={{ activeSession }}>{children}</ActiveSessionContext.Provider>
  );
}

/** The session that was already known to be active before this page ever rendered — read once, at mount. */
export function useInitialActiveSession() {
  const ctx = useContext(ActiveSessionContext);
  if (!ctx) throw new Error("useInitialActiveSession must be used within ActiveSessionProvider");
  return ctx.activeSession;
}

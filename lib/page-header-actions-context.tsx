"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { createPortal } from "react-dom";

type PageHeaderActionsContextValue = {
  container: HTMLElement | null;
  setContainer: (container: HTMLElement | null) => void;
};

const PageHeaderActionsContext = createContext<PageHeaderActionsContextValue | null>(null);

export function PageHeaderActionsProvider({ children }: { children: React.ReactNode }) {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const value = useMemo(() => ({ container, setContainer }), [container]);

  return (
    <PageHeaderActionsContext.Provider value={value}>
      {children}
    </PageHeaderActionsContext.Provider>
  );
}

export function PageHeaderActionsSlot() {
  const context = useContext(PageHeaderActionsContext);
  return (
    <div
      id="page-header-actions"
      ref={context?.setContainer}
      className="flex shrink-0 items-center empty:hidden"
    />
  );
}

export function PageHeaderActions({ children }: { children: React.ReactNode }) {
  const container = useContext(PageHeaderActionsContext);
  return container?.container ? createPortal(children, container.container) : null;
}

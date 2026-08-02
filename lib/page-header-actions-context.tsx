"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { createPortal } from "react-dom";

type PageHeaderActionsContextValue = {
  leftContainer: HTMLElement | null;
  rightContainer: HTMLElement | null;
  setLeftContainer: (container: HTMLElement | null) => void;
  setRightContainer: (container: HTMLElement | null) => void;
};

const PageHeaderActionsContext = createContext<PageHeaderActionsContextValue | null>(null);

export function PageHeaderActionsProvider({ children }: { children: React.ReactNode }) {
  const [leftContainer, setLeftContainer] = useState<HTMLElement | null>(null);
  const [rightContainer, setRightContainer] = useState<HTMLElement | null>(null);
  const value = useMemo(
    () => ({ leftContainer, rightContainer, setLeftContainer, setRightContainer }),
    [leftContainer, rightContainer],
  );

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
      ref={context?.setLeftContainer}
      className="flex shrink-0 items-center empty:hidden"
    />
  );
}

export function PageHeaderRightActionsSlot() {
  const context = useContext(PageHeaderActionsContext);
  return (
    <div
      id="page-header-right-actions"
      ref={context?.setRightContainer}
      className="flex shrink-0 items-center empty:hidden"
    />
  );
}

export function PageHeaderActions({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  const context = useContext(PageHeaderActionsContext);
  const container = align === "right" ? context?.rightContainer : context?.leftContainer;
  return container ? createPortal(children, container) : null;
}

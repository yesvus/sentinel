"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Wraps a scrollable region with top/bottom fades that fade out once you've scrolled
 * to the end, signalling there's more content hidden above or below.
 */
export function LongContentFade({
  className,
  wrapperClassName,
  fadeColor = "from-card",
  children,
}: {
  className?: string;
  wrapperClassName?: string;
  fadeColor?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [showTopFade, setShowTopFade] = useState(false);
  const [showBottomFade, setShowBottomFade] = useState(false);

  function updateFade() {
    const el = ref.current;
    if (!el) return;
    setShowTopFade(el.scrollTop > 1);
    setShowBottomFade(el.scrollHeight - el.scrollTop - el.clientHeight > 1);
  }

  useEffect(() => {
    updateFade();
  });

  return (
    <div className={cn("relative", wrapperClassName)}>
      <div ref={ref} onScroll={updateFade} className={className}>
        {children}
      </div>
      <div
        className={cn(
          `pointer-events-none absolute inset-x-0 top-0 h-5 bg-gradient-to-b to-transparent transition-opacity duration-200 ${fadeColor}`,
          showTopFade ? "opacity-100" : "opacity-0",
        )}
        aria-hidden="true"
      />
      <div
        className={cn(
          `pointer-events-none absolute inset-x-0 bottom-0 h-5 bg-gradient-to-t to-transparent transition-opacity duration-200 ${fadeColor}`,
          showBottomFade ? "opacity-100" : "opacity-0",
        )}
        aria-hidden="true"
      />
    </div>
  );
}

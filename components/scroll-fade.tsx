"use client";

import { useEffect, useRef, useState } from "react";

/** Wraps a scrollable region with a bottom fade that hides once scrolled to the end. */
export function ScrollFade({ className, children }: { className?: string; children: React.ReactNode }) {
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
    <div className="relative">
      <div ref={ref} onScroll={updateFade} className={className}>
        {children}
      </div>
      <div
        className={`from-card pointer-events-none absolute inset-x-0 top-0 h-5 bg-gradient-to-b to-transparent transition-opacity duration-200 ${
          showTopFade ? "opacity-100" : "opacity-0"
        }`}
        aria-hidden="true"
      />
      <div
        className={`from-card pointer-events-none absolute inset-x-0 bottom-0 h-5 bg-gradient-to-t to-transparent transition-opacity duration-200 ${
          showBottomFade ? "opacity-100" : "opacity-0"
        }`}
        aria-hidden="true"
      />
    </div>
  );
}

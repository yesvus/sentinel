"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function LandingNav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 20);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className={cn(
        "sticky top-0 z-50 flex items-center justify-between px-6 py-4 transition-[background-color,border-color,box-shadow] duration-300",
        scrolled
          ? "bg-background/80 border-b backdrop-blur-md"
          : "bg-transparent"
      )}
    >
      <Link
        href="/"
        className="text-primary text-xl tracking-tight"
        style={{ fontFamily: "var(--font-wordmark)", fontWeight: 800 }}
      >
        Sentinel
      </Link>
      <Link
        href="/login"
        className="text-muted-foreground hover:text-foreground text-sm font-medium transition-colors duration-150"
      >
        Login
      </Link>
    </nav>
  );
}
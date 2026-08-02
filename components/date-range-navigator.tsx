"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

type NavAction = { href: string } | { onClick: () => void };

function actionButtonProps(action: NavAction) {
  return "href" in action
    ? { render: <Link href={action.href} />, nativeButton: false as const }
    : { type: "button" as const, onClick: action.onClick };
}

/**
 * Shared "Today / prev / next / breadcrumb" cluster for the week and day
 * calendar headers, so the two stay visually and structurally identical
 * instead of drifting apart as separate copies.
 */
export function DateRangeNavigator({
  today,
  todayDisabled,
  previous,
  previousLabel,
  next,
  nextLabel,
  children,
}: {
  today: NavAction;
  todayDisabled?: boolean;
  previous: NavAction;
  previousLabel: string;
  next: NavAction;
  nextLabel: string;
  children?: ReactNode;
}) {
  return (
    <div className="animate-in fade-in slide-in-from-left-1 flex min-w-0 items-center gap-1 duration-300">
      <Button
        variant="outline"
        size="sm"
        className="hidden rounded-full px-5 sm:inline-flex"
        disabled={todayDisabled}
        {...(todayDisabled ? {} : actionButtonProps(today))}
      >
        Today
      </Button>
      <Button variant="ghost" size="icon-sm" className="rounded-full" aria-label={previousLabel} {...actionButtonProps(previous)}>
        <ChevronLeft />
      </Button>
      <Button variant="ghost" size="icon-sm" className="rounded-full" aria-label={nextLabel} {...actionButtonProps(next)}>
        <ChevronRight />
      </Button>
      {children}
    </div>
  );
}

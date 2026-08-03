"use client";

import { Play, Square } from "lucide-react";
import { useDemoTimer } from "@/hooks/use-demo-timer";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function formatElapsed(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

export function DemoTimer() {
  const { elapsedMs, isRunning, projectName, start, stop } = useDemoTimer();

  return (
    <Card
      className={cn(
        "w-full max-w-sm mx-auto transition-shadow duration-1000",
        isRunning && "shadow-[0_0_60px_-12px_var(--primary)]"
      )}
    >
      <CardContent className="space-y-4">
        <div
            className={cn(
              "grid transition-all duration-300 ease-out",
              isRunning ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
            )}
          >
            <div className="min-h-0 overflow-hidden">
              <div className="flex max-w-full items-center gap-1.5">
                <div className="bg-muted/60 text-muted-foreground flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium">
                  <span className="truncate">{projectName}</span>
                </div>
              </div>
            </div>
          </div>
        <div className="flex flex-col items-center gap-5 border-b pt-4 pb-4">
          <p
            className={cn(
              "font-mono text-5xl font-medium tracking-tight tabular-nums transition-[color,opacity] duration-150 select-none sm:text-6xl md:text-7xl",
              !isRunning && "text-muted-foreground/40"
            )}
            aria-live="polite"
          >
            {formatElapsed(isRunning ? elapsedMs : 0)}
          </p>
          <div className="flex items-center gap-3">
            <div className="size-10 shrink-0" aria-hidden="true" />
            <Button
              size="icon"
              onClick={isRunning ? stop : start}
              aria-label={isRunning ? "Stop timer" : "Start timer"}
              className={cn(
                "size-16 shrink-0 rounded-full shadow-sm transition-[color,background-color,transform] duration-150 active:scale-95",
                isRunning && "bg-destructive text-destructive-foreground hover:bg-destructive/90"
              )}
            >
              {isRunning ? (
                <Square className="size-5 fill-current" />
              ) : (
                <Play className="ml-0.5 size-6 fill-current" />
              )}
            </Button>
            <div className="size-10 shrink-0" aria-hidden="true" />
          </div>
          <div
            className={cn(
              "grid transition-all duration-300 ease-out",
              isRunning ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"
            )}
          >
            <div className="min-h-0 overflow-hidden">
              <p className="text-muted-foreground text-xs">
                Tap to start focusing
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
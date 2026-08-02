"use client";

import { Flame, Trophy } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function StreakSummaryCard({
  current,
  longest,
}: {
  current: number;
  longest: number;
}) {
  return (
    <Card className="h-76 min-w-0">
      <CardHeader>
        <CardTitle>Streaks</CardTitle>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col justify-center gap-6">
        <div className="animate-in fade-in zoom-in-95 flex items-center gap-3 duration-300">
          <span className="bg-primary/12 text-primary flex size-11 shrink-0 items-center justify-center rounded-xl">
            <Flame className="size-5" />
          </span>
          <div>
            <p className="font-mono text-3xl font-medium tracking-tight tabular-nums">
              {current}<span className="text-muted-foreground ml-1 text-sm font-normal">{current === 1 ? "day" : "days"}</span>
            </p>
            <p className="text-muted-foreground text-xs">Current streak</p>
          </div>
        </div>
        <div className="border-border flex items-center gap-3 border-t pt-5">
          <span className="bg-secondary/15 text-secondary flex size-9 shrink-0 items-center justify-center rounded-lg">
            <Trophy className="size-4" />
          </span>
          <div>
            <p className="font-mono text-xl font-medium tabular-nums">
              {longest}<span className="text-muted-foreground ml-1 text-xs font-normal">{longest === 1 ? "day" : "days"}</span>
            </p>
            <p className="text-muted-foreground text-xs">Longest streak</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

"use client";

import { useState, useEffect } from "react";
import { Pause, Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";

function useFakeTimer(initialMs: number) {
  const [elapsedMs, setElapsedMs] = useState(initialMs);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!running) return;
    const interval = setInterval(() => {
      setElapsedMs((prev) => prev + 1000);
    }, 1000);
    return () => clearInterval(interval);
  }, [running]);

  return { elapsedMs, running, toggle: () => setRunning((r) => !r), reset: () => { setRunning(false); setElapsedMs(0); } };
}

function fmt(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((v) => String(v).padStart(2, "0")).join(":");
}

function Controls({ running, onToggle, onReset }: { running: boolean; onToggle: () => void; onReset: () => void }) {
  return (
    <div className="flex items-center gap-3">
      <Button size="icon" variant="outline" onClick={onToggle} aria-label={running ? "Pause" : "Play"} className="rounded-full">
        {running ? <Pause className="size-4 fill-current" /> : <Play className="ml-0.5 size-4 fill-current" />}
      </Button>
      <Button size="icon" variant="outline" onClick={onReset} aria-label="Reset" className="rounded-full">
        <Square className="size-4 fill-current" />
      </Button>
    </div>
  );
}

function DesignA({ elapsedMs, running }: { elapsedMs: number; running: boolean }) {
  const t = fmt(elapsedMs);
  return (
    <div className="flex flex-col items-center gap-6">
      <h3 className="text-sm font-medium text-muted-foreground">A — Dark inset display</h3>
      <div className="inline-flex items-center rounded-lg bg-[oklch(0.15_0.01_240)] px-10 py-6 shadow-[inset_0_2px_8px_rgba(0,0,0,0.6),inset_0_0_0_1px_oklch(0.18_0.01_240)]">
        <span
          className="font-mono text-5xl tracking-tighter tabular-nums sm:text-6xl"
          style={{
            color: running
              ? "oklch(0.65 0.18 185 / 0.9)"
              : "oklch(0.65 0.18 185 / 0.45)",
            textShadow: running
              ? "0 0 2px oklch(0.65 0.18 185 / 0.3), 0 0 8px oklch(0.70 0.22 185 / 0.15), 0 0 20px oklch(0.75 0.25 185 / 0.08)"
              : "0 0 2px oklch(0.65 0.18 185 / 0.15)",
          }}
        >
          {t}
        </span>
      </div>
    </div>
  );
}

function DesignB({ elapsedMs, running }: { elapsedMs: number; running: boolean }) {
  const t = fmt(elapsedMs);
  return (
    <div className="flex flex-col items-center gap-6">
      <h3 className="text-sm font-medium text-muted-foreground">B — Frosted glass</h3>
      <div
        className="relative inline-flex items-center rounded-3xl px-12 py-8 shadow-[0_1px_2px_rgba(0,0,0,0.3),0_8px_32px_rgba(0,0,0,0.2)] ring-1 ring-white/[0.06] ring-inset"
        style={{
          background: "oklch(0.25 0 0 / 0.6)",
          backdropFilter: "blur(40px) saturate(150%)",
          WebkitBackdropFilter: "blur(40px) saturate(150%)",
        }}
      >
        <span className={running ? "font-mono text-5xl font-semibold tracking-[-0.02em] tabular-nums text-white/90 sm:text-6xl" : "font-mono text-5xl font-semibold tracking-[-0.02em] tabular-nums text-white/50 sm:text-6xl"}>
          {t}
        </span>
      </div>
    </div>
  );
}

function DesignC({ elapsedMs, running }: { elapsedMs: number; running: boolean }) {
  const t = fmt(elapsedMs);
  const [hh, mm, ss] = t.split(":");
  return (
    <div className="flex flex-col items-center gap-6">
      <h3 className="text-sm font-medium text-muted-foreground">C — Swiss typographic</h3>
      <div className="flex items-baseline gap-1 font-mono tracking-tighter tabular-nums">
        <span className="text-[clamp(1.5rem,4vw,2.5rem)] font-light opacity-35" style={{ color: "#147d92" }}>{hh}</span>
        <span className="text-[clamp(1rem,3vw,2rem)] font-light opacity-20" style={{ color: "#147d92" }}>:</span>
        <span className="text-[clamp(4rem,14vw,9rem)] font-semibold tracking-[-0.03em]" style={{ color: running ? "#147d92" : "oklch(0.51 0.08 200 / 0.5)" }}>{mm}</span>
        <span className="text-[clamp(1rem,3vw,2rem)] font-light opacity-20" style={{ color: "#147d92" }}>:</span>
        <span className="text-[clamp(1.5rem,4vw,2.5rem)] font-normal opacity-55" style={{ color: "#147d92" }}>{ss}</span>
      </div>
    </div>
  );
}

function DesignD({ elapsedMs, running }: { elapsedMs: number; running: boolean }) {
  const t = fmt(elapsedMs);
  return (
    <div className="flex flex-col items-center gap-6">
      <h3 className="text-sm font-medium text-muted-foreground">D — Soft pill with glow</h3>
      <div className="relative">
        <div
          className="absolute inset-0 rounded-full opacity-40 blur-xl transition-opacity duration-1000"
          style={{
            backgroundColor: "oklch(0.55 0.12 200)",
            opacity: running ? 0.45 : 0.2,
          }}
        />
        <div
          className="relative inline-flex items-center rounded-full px-12 py-7 shadow-[0_4px_24px_oklch(0.55_0.12_200_/_0.18)]"
          style={{
            background: "linear-gradient(to bottom, oklch(0.55 0.12 200), oklch(0.50 0.14 205))",
          }}
        >
          <span className="font-mono text-5xl font-semibold tracking-tight tabular-nums text-[oklch(0.97_0_0)] sm:text-6xl">
            {t}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function DemoTimersPage() {
  const t1 = useFakeTimer(0);
  const t2 = useFakeTimer(0);
  const t3 = useFakeTimer(0);
  const t4 = useFakeTimer(0);

  return (
    <div className="flex min-h-full flex-col items-center gap-12 px-6 py-12">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Timer Display Variants</h1>
        <p className="mt-1 text-sm text-muted-foreground">Press Play on each to see running state.</p>
      </div>

      <div className="grid w-full max-w-4xl gap-16 md:grid-cols-2">
        <div className="flex flex-col items-center gap-4">
          <DesignA elapsedMs={t1.elapsedMs} running={t1.running} />
          <Controls running={t1.running} onToggle={t1.toggle} onReset={t1.reset} />
        </div>
        <div className="flex flex-col items-center gap-4">
          <DesignB elapsedMs={t2.elapsedMs} running={t2.running} />
          <Controls running={t2.running} onToggle={t2.toggle} onReset={t2.reset} />
        </div>
        <div className="flex flex-col items-center gap-4">
          <DesignC elapsedMs={t3.elapsedMs} running={t3.running} />
          <Controls running={t3.running} onToggle={t3.toggle} onReset={t3.reset} />
        </div>
        <div className="flex flex-col items-center gap-4">
          <DesignD elapsedMs={t4.elapsedMs} running={t4.running} />
          <Controls running={t4.running} onToggle={t4.toggle} onReset={t4.reset} />
        </div>
      </div>
    </div>
  );
}
"use client";

import { AudioLines, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNoisePlayer } from "@/lib/noise-player";

export function NoiseControl() {
  const { playing, toggle, volume, setVolume } = useNoisePlayer();
  return (
    <div className="flex items-center gap-2">
      {playing && (
        <input
          type="range"
          min="0"
          max="100"
          value={Math.round(volume * 100)}
          onChange={(event) => setVolume(Number(event.target.value) / 100)}
          aria-label="Focus Audio volume"
          className="accent-primary hidden h-1.5 w-20 cursor-pointer sm:block"
        />
      )}
      <Button
        type="button"
        size="sm"
        variant={playing ? "default" : "ghost"}
        onClick={toggle}
        aria-pressed={playing}
        aria-label={playing ? "Stop Focus Audio" : "Start Focus Audio"}
        title={playing ? "Stop Focus Audio" : "Start Focus Audio"}
      >
        {playing ? <Volume2 /> : <AudioLines />}
        <span className="hidden sm:inline">{playing ? `${Math.round(volume * 100)}%` : "Focus Audio"}</span>
      </Button>
    </div>
  );
}

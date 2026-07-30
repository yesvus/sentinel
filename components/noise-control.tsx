"use client";

import { useState } from "react";
import { AudioLines, Pause, Play, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ApiError, auth, FocusAudioType } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useNoisePlayer } from "@/lib/noise-player";

const SOUNDS: { value: FocusAudioType; label: string }[] = [
  { value: "speech-blocker", label: "Speech Blocker" },
  { value: "brown", label: "Brown noise" },
  { value: "pink", label: "Pink noise" },
  { value: "white", label: "White noise" },
  { value: "binaural-40hz", label: "40 Hz binaural beats" },
];

export function NoiseControl() {
  const { user, refresh } = useAuth();
  const { playing, toggle, volume, setVolume } = useNoisePlayer();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function updateAudioSettings(
    details: { autoStartNoise?: boolean; focusAudioType?: FocusAudioType },
  ) {
    setSaving(true);
    setError(null);
    try {
      await auth.updateAudioSettings(details);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save Focus Audio settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            size="sm"
            variant={playing ? "default" : "ghost"}
            aria-label="Open Focus Audio controls"
          />
        }
      >
        {playing ? <Volume2 /> : <AudioLines />}
        <span className="hidden sm:inline">Focus Audio</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="bottom" align="end" sideOffset={8} className="w-80">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Focus Audio</DropdownMenuLabel>
          <div className="space-y-4 px-2 pb-2">
            <Button
              type="button"
              className="w-full"
              variant={playing ? "outline" : "default"}
              onClick={toggle}
            >
              {playing ? <Pause /> : <Play />}
              {playing ? "Stop audio" : "Start audio"}
            </Button>

            <label className="block space-y-2 text-sm font-medium">
              <span>Sound</span>
              <select
                value={user?.focusAudioType ?? "speech-blocker"}
                onChange={(event) =>
                  updateAudioSettings({ focusAudioType: event.target.value as FocusAudioType })
                }
                disabled={saving}
                className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
              >
                {SOUNDS.map((sound) => (
                  <option key={sound.value} value={sound.value}>
                    {sound.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-2 text-sm font-medium">
              <span className="flex items-center justify-between">
                <span>Volume</span>
                <span className="text-muted-foreground">{Math.round(volume * 100)}%</span>
              </span>
              <input
                type="range"
                min="0"
                max="100"
                value={Math.round(volume * 100)}
                onChange={(event) => setVolume(Number(event.target.value) / 100)}
                aria-label="Focus Audio volume"
                className="accent-primary h-2 w-full cursor-pointer"
              />
            </label>
          </div>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <div className="flex items-center justify-between gap-3 px-2 py-2">
          <div>
            <p className="text-sm font-medium">Start with sessions</p>
            <p className="text-muted-foreground text-xs">Fade in and out automatically</p>
          </div>
          <Button
            type="button"
            size="sm"
            variant={user?.autoStartNoise ? "default" : "outline"}
            role="switch"
            aria-checked={user?.autoStartNoise ?? false}
            disabled={saving}
            onClick={() => updateAudioSettings({ autoStartNoise: !user?.autoStartNoise })}
          >
            {user?.autoStartNoise ? "On" : "Off"}
          </Button>
        </div>
        {error && <p className="text-destructive px-2 pb-2 text-xs">{error}</p>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

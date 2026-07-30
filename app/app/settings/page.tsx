"use client";

import { useState } from "react";
import { AudioLines, Clock3, Monitor, Moon, ShieldCheck, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError, auth, FocusAudioType } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { ThemeMode, useTheme } from "@/lib/theme-context";

export default function SettingsPage() {
  const { user, refresh } = useAuth();
  const { mode, schedule, setMode, setSchedule } = useTheme();
  const [savingPrivacy, setSavingPrivacy] = useState(false);
  const [savingAudio, setSavingAudio] = useState(false);
  const [savingSound, setSavingSound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function update(setting: "privacy" | "audio") {
    if (!user) return;
    const setSaving = setting === "privacy" ? setSavingPrivacy : setSavingAudio;
    setSaving(true);
    setError(null);
    try {
      if (setting === "privacy") await auth.updatePrivacy(!user.shareSessionDescriptions);
      else await auth.updateAudioSettings({ autoStartNoise: !user.autoStartNoise });
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save setting");
    } finally {
      setSaving(false);
    }
  }

  async function updateFocusAudio(focusAudioType: FocusAudioType) {
    setSavingSound(true);
    setError(null);
    try {
      await auth.updateAudioSettings({ focusAudioType });
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save focus audio");
    } finally {
      setSavingSound(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      {error && <p className="text-destructive text-sm">{error}</p>}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="text-muted-foreground size-4" />Social privacy</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-2xl space-y-1">
            <p className="text-sm font-medium">Share session descriptions with friends</p>
            <p className="text-muted-foreground text-sm">Friends can always see project, duration, and timing. When enabled, descriptions from past and current sessions are also visible. Activity is never visible to people who are not confirmed friends.</p>
          </div>
          <Button variant={user?.shareSessionDescriptions ? "default" : "outline"} role="switch" aria-checked={user?.shareSessionDescriptions ?? false} onClick={() => update("privacy")} disabled={savingPrivacy}>
            {savingPrivacy ? "Saving..." : user?.shareSessionDescriptions ? "Sharing on" : "Sharing off"}
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sun className="text-muted-foreground size-4" />
            Appearance
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-2 sm:grid-cols-4">
            {([
              ["system", "System", Monitor],
              ["light", "Light", Sun],
              ["dark", "Dark", Moon],
              ["scheduled", "Scheduled", Clock3],
            ] as const).map(([value, label, Icon]) => (
              <Button
                key={value}
                type="button"
                variant={mode === value ? "default" : "outline"}
                onClick={() => setMode(value as ThemeMode)}
                aria-pressed={mode === value}
              >
                <Icon />
                {label}
              </Button>
            ))}
          </div>
          <p className="text-muted-foreground text-sm">
            System follows your device and is the default. Scheduled switches automatically using
            your local time.
          </p>
          {mode === "scheduled" && (
            <div className="grid max-w-md gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-sm font-medium">
                <span>Dark from</span>
                <input
                  type="time"
                  value={schedule.darkFrom}
                  onChange={(event) => setSchedule({ ...schedule, darkFrom: event.target.value })}
                  className="border-input bg-background h-9 w-full rounded-md border px-3"
                />
              </label>
              <label className="space-y-2 text-sm font-medium">
                <span>Light from</span>
                <input
                  type="time"
                  value={schedule.lightFrom}
                  onChange={(event) => setSchedule({ ...schedule, lightFrom: event.target.value })}
                  className="border-input bg-background h-9 w-full rounded-md border px-3"
                />
              </label>
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><AudioLines className="text-muted-foreground size-4" />Focus audio</CardTitle></CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <label htmlFor="focus-audio-type" className="text-sm font-medium">Sound</label>
            <select
              id="focus-audio-type"
              value={user?.focusAudioType ?? "speech-blocker"}
              onChange={(event) => updateFocusAudio(event.target.value as FocusAudioType)}
              disabled={savingSound}
              className="border-input bg-background ring-offset-background focus-visible:ring-ring h-9 w-full max-w-sm rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
            >
              <option value="speech-blocker">Speech Blocker — hill-shaped masking</option>
              <option value="brown">Brown noise — deep and soft</option>
              <option value="pink">Pink noise — balanced</option>
              <option value="white">White noise — bright and even</option>
              <option value="binaural-40hz">40 Hz binaural beats — headphones</option>
            </select>
            <p className="text-muted-foreground text-xs">
              Binaural beats use different tones in each ear, so headphones are required for the intended effect.
            </p>
          </div>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-2xl space-y-1">
              <p className="text-sm font-medium">Start Focus Audio with each session</p>
              <p className="text-muted-foreground text-sm">Gently fades in when a session starts and fades out when it stops. Playback and volume are synchronized across open Sentinel tabs.</p>
            </div>
            <Button variant={user?.autoStartNoise ? "default" : "outline"} role="switch" aria-checked={user?.autoStartNoise ?? false} onClick={() => update("audio")} disabled={savingAudio}>
              {savingAudio ? "Saving..." : user?.autoStartNoise ? "Auto-start on" : "Auto-start off"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

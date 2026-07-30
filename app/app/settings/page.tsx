"use client";

import { useState } from "react";
import { Clock3, Gauge, Monitor, Moon, ShieldCheck, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError, auth } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { ThemeMode, useTheme } from "@/lib/theme-context";

export default function SettingsPage() {
  const { user, refresh } = useAuth();
  const { mode, schedule, setMode, setSchedule } = useTheme();
  const [savingPrivacy, setSavingPrivacy] = useState(false);
  const [savingSessionDefault, setSavingSessionDefault] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function update() {
    if (!user) return;
    setSavingPrivacy(true);
    setError(null);
    try {
      await auth.updatePrivacy(!user.shareSessionDescriptions);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save setting");
    } finally {
      setSavingPrivacy(false);
    }
  }

  async function updateSessionDefault(defaultSessionType: "learning" | "producing") {
    setSavingSessionDefault(true);
    setError(null);
    try {
      await auth.updateSessionSettings(defaultSessionType);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save session default");
    } finally {
      setSavingSessionDefault(false);
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
          <Button variant={user?.shareSessionDescriptions ? "default" : "outline"} role="switch" aria-checked={user?.shareSessionDescriptions ?? false} onClick={update} disabled={savingPrivacy}>
            {savingPrivacy ? "Saving..." : user?.shareSessionDescriptions ? "Sharing on" : "Sharing off"}
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gauge className="text-muted-foreground size-4" />
            Session default
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <p className="text-sm font-medium">New sessions begin as</p>
            <p className="text-muted-foreground text-sm">
              This sets the initial position in the finish screen. You can still adjust every session.
            </p>
          </div>
          <div className="grid max-w-sm grid-cols-2 gap-2">
            {(["learning", "producing"] as const).map((value) => (
              <Button
                key={value}
                type="button"
                variant={user?.defaultSessionType === value ? "default" : "outline"}
                disabled={savingSessionDefault}
                aria-pressed={user?.defaultSessionType === value}
                onClick={() => updateSessionDefault(value)}
              >
                {value === "learning" ? "Learning" : "Producing"}
              </Button>
            ))}
          </div>
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
    </div>
  );
}

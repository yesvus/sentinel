"use client";

import { useState } from "react";
import { CalendarDays, Copy, Gauge, Monitor, Moon, ShieldCheck, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError, auth, calendar } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { ThemeMode, useTheme } from "@/lib/theme-context";
import { pad } from "@/lib/date";

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function SettingsPage() {
  const { user, refresh } = useAuth();
  const { mode, setMode } = useTheme();
  const [savingPrivacy, setSavingPrivacy] = useState(false);
  const [savingSessionDefault, setSavingSessionDefault] = useState(false);
  const [calendarToken, setCalendarToken] = useState<string | null>(null);
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

  async function createCalendarFeed() {
    setError(null);
    try {
      setCalendarToken((await calendar.token()).token);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create calendar feed");
    }
  }

  async function revokeCalendarFeed() {
    await calendar.revoke();
    setCalendarToken(null);
  }

  async function updateSessionDefault(defaultSessionType: "learning" | "producing") {
    setSavingSessionDefault(true);
    setError(null);
    try {
      await auth.updateSessionSettings({ defaultSessionType });
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save session default");
    } finally {
      setSavingSessionDefault(false);
    }
  }

  async function toggleTrackProductionSplit() {
    if (!user) return;
    setSavingSessionDefault(true);
    setError(null);
    try {
      await auth.updateSessionSettings({ trackProductionSplit: !user.trackProductionSplit });
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save session setting");
    } finally {
      setSavingSessionDefault(false);
    }
  }

  async function updatePlanReminderHour(hour: number) {
    setSavingSessionDefault(true);
    setError(null);
    try {
      await auth.updateSessionSettings({ planReminderHour: hour });
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save reminder time");
    } finally {
      setSavingSessionDefault(false);
    }
  }

  async function updatePauseTimeout(minutes: number) {
    setSavingSessionDefault(true);
    setError(null);
    try {
      await auth.updateSessionSettings({ sessionPauseTimeoutMinutes: minutes });
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save pause timeout");
    } finally {
      setSavingSessionDefault(false);
    }
  }

  async function updateWeeklyReminder(details: { day?: number; hour?: number }) {
    setSavingSessionDefault(true);
    setError(null);
    try {
      await auth.updateSessionSettings({
        planWeeklyReminderDay: details.day,
        planWeeklyReminderHour: details.hour,
      });
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save reminder time");
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
            <CalendarDays className="text-muted-foreground size-4" />
            Calendar sync
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm font-medium">Sentinel activity calendar</p>
            <p className="text-muted-foreground text-sm">
              Subscribe from Google Calendar, Apple Calendar, Outlook, or another iCalendar app.
              Completed sessions appear as events. Treat the private link like a password.
            </p>
          </div>
          {!calendarToken ? (
            <Button type="button" variant="outline" onClick={createCalendarFeed}>
              Create private calendar link
            </Button>
          ) : (
            <div className="space-y-3">
              <code className="bg-muted block overflow-x-auto rounded-md p-3 text-xs">
                {`${typeof window === "undefined" ? "" : window.location.origin}/api/calendar/feed?token=${calendarToken}`}
              </code>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigator.clipboard.writeText(`${window.location.origin}/api/calendar/feed?token=${calendarToken}`)}
                >
                  <Copy />
                  Copy subscription URL
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  render={<a href={`/api/calendar/feed?token=${calendarToken}`} download="sentinel-activity.ics" />}
                >
                  Download .ics
                </Button>
                <Button type="button" variant="destructive" onClick={revokeCalendarFeed}>
                  Revoke link
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gauge className="text-muted-foreground size-4" />
            Session default
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-2xl space-y-1">
              <p className="text-sm font-medium">Track learning vs. producing</p>
              <p className="text-muted-foreground text-sm">
                Ask for a Learning/Producing split when you finish a session. Turn this off to skip
                that step entirely.
              </p>
            </div>
            <Button
              variant={user?.trackProductionSplit ? "default" : "outline"}
              role="switch"
              aria-checked={user?.trackProductionSplit ?? false}
              onClick={toggleTrackProductionSplit}
              disabled={savingSessionDefault}
            >
              {savingSessionDefault ? "Saving..." : user?.trackProductionSplit ? "Tracking on" : "Tracking off"}
            </Button>
          </div>
          {user?.trackProductionSplit && (
            <div className="space-y-3 border-t pt-4">
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
            </div>
          )}
          <div className="space-y-2 border-t pt-4">
            <div>
              <p className="text-sm font-medium">Paused session timeout</p>
              <p className="text-muted-foreground text-sm">
                End a session after a real interruption stays paused this long. Paused time is never counted as work.
              </p>
            </div>
            <select
              value={user?.sessionPauseTimeoutMinutes ?? 30}
              onChange={(event) => updatePauseTimeout(Number(event.target.value))}
              disabled={savingSessionDefault}
              aria-label="Paused session timeout"
              className="border-input bg-background h-9 rounded-md border px-3 text-sm transition-colors duration-150"
            >
              {[5, 10, 15, 30, 45, 60, 90, 120, 180].map((minutes) => (
                <option key={minutes} value={minutes}>{minutes} minutes</option>
              ))}
            </select>
          </div>
          <div className="space-y-2 border-t pt-4">
            <div>
              <p className="text-sm font-medium">Daily calendar reminder</p>
              <p className="text-muted-foreground text-sm">
                A soft nudge on the Calendar tab after this time if tomorrow isn&apos;t planned yet. It&apos;s just a
                reminder — nothing is blocked.
              </p>
            </div>
            <input
              type="time"
              value={`${pad(user?.planReminderHour ?? 19)}:00`}
              onChange={(event) => updatePlanReminderHour(Number(event.target.value.split(":")[0]))}
              disabled={savingSessionDefault}
              className="border-input bg-background h-9 w-full max-w-40 rounded-md border px-3"
            />
          </div>
          <div className="space-y-2 border-t pt-4">
            <div>
              <p className="text-sm font-medium">Weekly calendar reminder</p>
              <p className="text-muted-foreground text-sm">
                A soft nudge on this day and time to wrap up the week and set up the next one.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <select
                value={user?.planWeeklyReminderDay ?? 0}
                onChange={(event) => updateWeeklyReminder({ day: Number(event.target.value) })}
                disabled={savingSessionDefault}
                aria-label="Weekly calendar reminder day"
                className="border-input bg-background h-9 rounded-md border px-3 text-sm"
              >
                {WEEKDAY_NAMES.map((label, i) => (
                  <option key={label} value={i}>{label}</option>
                ))}
              </select>
              <input
                type="time"
                value={`${pad(user?.planWeeklyReminderHour ?? 19)}:00`}
                onChange={(event) => updateWeeklyReminder({ hour: Number(event.target.value.split(":")[0]) })}
                disabled={savingSessionDefault}
                aria-label="Weekly calendar reminder time"
                className="border-input bg-background h-9 w-full max-w-40 rounded-md border px-3"
              />
            </div>
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
          <div className="grid gap-2 sm:grid-cols-3">
            {([
              ["system", "System", Monitor],
              ["light", "Light", Sun],
              ["dark", "Dark", Moon],
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
            System follows your device.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

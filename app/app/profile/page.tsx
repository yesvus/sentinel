"use client";

import { useEffect, useState, FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { UserRound, KeyRound, Sparkles, Target } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ActivityHeatmap } from "@/components/activity-heatmap";
import { NoteFocusCard } from "@/components/note-focus-card";
import {
  auth,
  ApiError,
  LONG_TERM_NOTE_KEY,
  Note,
  StudySession,
  notes as notesApi,
  sessions as sessionsApi,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useActiveSession } from "@/lib/active-session-context";
import { Avatar, AVATAR_ICONS, AvatarIconKey } from "@/lib/icons";

export default function ProfilePage() {
  const { user, refresh } = useAuth();
  const { activeSession, now } = useActiveSession();
  const [name, setName] = useState(user?.name ?? "");
  const [avatar, setAvatar] = useState<string | null>(user?.avatar ?? null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);

  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  const [planContext, setPlanContext] = useState(user?.planContext ?? "");
  const [savingPlanContext, setSavingPlanContext] = useState(false);
  const [planContextError, setPlanContextError] = useState<string | null>(null);
  const [planContextSaved, setPlanContextSaved] = useState(false);
  const [activitySessions, setActivitySessions] = useState<StudySession[]>([]);
  const [longTermNote, setLongTermNote] = useState<Note | undefined>();
  const [insightsLoading, setInsightsLoading] = useState(true);

  useEffect(() => {
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    from.setDate(from.getDate() - 97);
    Promise.all([sessionsApi.list({ from: from.toISOString() }), notesApi.list()])
      .then(([sessionList, noteList]) => {
        setActivitySessions(sessionList);
        setLongTermNote(noteList.find((note) => note.scope === "long-term" && note.date_key === LONG_TERM_NOTE_KEY));
      })
      .finally(() => setInsightsLoading(false));
  }, []);

  const canonicalActivitySessions = [
    ...(activeSession ? [activeSession] : []),
    ...activitySessions.filter((session) => session.ended_at !== null && session.id !== activeSession?.id),
  ];

  async function handleSaveProfile(e: FormEvent) {
    e.preventDefault();
    setProfileError(null);
    setProfileSaved(false);
    setSavingProfile(true);
    try {
      await auth.updateProfile({ name: name || null, avatar });
      await refresh();
      setProfileSaved(true);
    } catch (err) {
      setProfileError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleSavePlanContext(e: FormEvent) {
    e.preventDefault();
    setPlanContextError(null);
    setPlanContextSaved(false);
    setSavingPlanContext(true);
    try {
      await auth.updateProfile({ planContext: planContext.trim() || null });
      await refresh();
      setPlanContextSaved(true);
    } catch (err) {
      setPlanContextError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setSavingPlanContext(false);
    }
  }

  async function handleChangePassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSaved(false);

    const form = new FormData(e.currentTarget);
    const currentPassword = String(form.get("currentPassword"));
    const newPassword = String(form.get("newPassword"));
    const confirmPassword = String(form.get("confirmPassword"));

    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords don't match");
      return;
    }

    setChangingPassword(true);
    try {
      await auth.changePassword(currentPassword, newPassword);
      setPasswordSaved(true);
      e.currentTarget.reset();
    } catch (err) {
      setPasswordError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setChangingPassword(false);
    }
  }

  return (
    <div className="animate-in fade-in mx-auto w-full max-w-5xl space-y-8 duration-500 fill-mode-both">
      <p className="text-muted-foreground text-sm">{user?.email}</p>

      {insightsLoading ? (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.6fr)]">
          <Card><CardHeader><Skeleton className="h-5 w-28" /></CardHeader><CardContent><Skeleton className="h-32 w-full" /></CardContent></Card>
          <Card><CardHeader><Skeleton className="h-5 w-36" /></CardHeader><CardContent><Skeleton className="h-20 w-full" /></CardContent></Card>
        </div>
      ) : (
        <div className="animate-in fade-in slide-in-from-bottom-1 grid items-start gap-8 duration-300 lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.6fr)]">
          <ActivityHeatmap sessions={canonicalActivitySessions} now={now} />
          <NoteFocusCard
            icon={<Target className="text-muted-foreground size-4" />}
            title="Long-term goals"
            scope="long-term"
            dateKey={LONG_TERM_NOTE_KEY}
            note={longTermNote}
            emptyText="Where are you trying to get to? Click to add goals."
            placeholder="Where are you trying to get to? e.g. Get Sentinel to 100 active users, get comfortable with Rust..."
            dialogTitle="Long-term goals"
            dialogDescription="Standing goals — not tied to any week. Shown as context in every AI review."
            onSaved={setLongTermNote}
            onDeleted={() => setLongTermNote(undefined)}
          />
        </div>
      )}

      <div className="grid gap-8 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserRound className="text-muted-foreground size-4" />
              Name & avatar
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSaveProfile}>
              <div className="flex items-center gap-4">
                <Avatar avatar={avatar} className="size-14 shrink-0 overflow-hidden rounded-full" />
                <div className="grid flex-1 grid-cols-6 gap-2">
                  {(Object.keys(AVATAR_ICONS) as AvatarIconKey[]).map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setAvatar(key)}
                      className={`inline-flex size-9 shrink-0 items-center justify-center rounded-full p-0.5 ring-2 transition-opacity ${
                        avatar === key ? "ring-primary" : "ring-transparent opacity-60 hover:opacity-100"
                      }`}
                    >
                      <Avatar avatar={key} className="size-full overflow-hidden rounded-full" />
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
              </div>

              {profileError && <p className="text-destructive text-sm">{profileError}</p>}
              {profileSaved && <p className="text-sm text-emerald-600">Saved.</p>}

              <Button type="submit" disabled={savingProfile}>
                {savingProfile ? "Saving..." : "Save"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="text-muted-foreground size-4" />
              Change password
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleChangePassword}>
              <div className="space-y-2">
                <Label htmlFor="currentPassword">Current password</Label>
                <Input id="currentPassword" name="currentPassword" type="password" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="newPassword">New password</Label>
                <Input id="newPassword" name="newPassword" type="password" minLength={8} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm new password</Label>
                <Input id="confirmPassword" name="confirmPassword" type="password" minLength={8} required />
              </div>

              {passwordError && <p className="text-destructive text-sm">{passwordError}</p>}
              {passwordSaved && <p className="text-sm text-emerald-600">Password updated.</p>}

              <Button type="submit" disabled={changingPassword}>
                {changingPassword ? "Updating..." : "Update password"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="text-muted-foreground size-4" />
            About you
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSavePlanContext}>
            <p className="text-muted-foreground text-sm">
              Included in every AI review prompt as context: your role, working hours, constraints,
              and current focus. The more specific, the less generic the feedback.
            </p>
            <Textarea
              value={planContext}
              onChange={(e) => setPlanContext(e.target.value)}
              placeholder="e.g. Backend engineer, mornings are meetings, evenings are deep work. Currently focused on shipping the v2 API."
              className="min-h-24"
            />
            {planContextError && <p className="text-destructive text-sm">{planContextError}</p>}
            {planContextSaved && <p className="text-sm text-emerald-600">Saved.</p>}
            <Button type="submit" disabled={savingPlanContext}>
              {savingPlanContext ? "Saving..." : "Save"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

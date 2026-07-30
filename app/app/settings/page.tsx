"use client";

import { useState } from "react";
import { AudioLines, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError, auth } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

export default function SettingsPage() {
  const { user, refresh } = useAuth();
  const [savingPrivacy, setSavingPrivacy] = useState(false);
  const [savingAudio, setSavingAudio] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function update(setting: "privacy" | "audio") {
    if (!user) return;
    const setSaving = setting === "privacy" ? setSavingPrivacy : setSavingAudio;
    setSaving(true);
    setError(null);
    try {
      if (setting === "privacy") await auth.updatePrivacy(!user.shareSessionDescriptions);
      else await auth.updateAudioSettings(!user.autoStartNoise);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save setting");
    } finally {
      setSaving(false);
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
        <CardHeader><CardTitle className="flex items-center gap-2"><AudioLines className="text-muted-foreground size-4" />Focus audio</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-2xl space-y-1">
            <p className="text-sm font-medium">Start speech masking with each session</p>
            <p className="text-muted-foreground text-sm">Gently fades in when a session starts and fades out when it stops. Playback and volume are synchronized across open Sentinel tabs.</p>
          </div>
          <Button variant={user?.autoStartNoise ? "default" : "outline"} role="switch" aria-checked={user?.autoStartNoise ?? false} onClick={() => update("audio")} disabled={savingAudio}>
            {savingAudio ? "Saving..." : user?.autoStartNoise ? "Auto-start on" : "Auto-start off"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

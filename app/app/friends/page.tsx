"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Check, Clock3, UserPlus, Users, X, Zap } from "lucide-react";
import { ApiError, Connection, FriendActivity, social } from "@/lib/api";
import { Avatar } from "@/lib/icons";
import { ProjectIcon } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";

function displayName(name: string | null, email: string) {
  return name?.trim() || email;
}

function formatDuration(seconds: number | null, startedAt: string) {
  const total = seconds ?? Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return hours ? `${hours}h ${minutes}m` : `${Math.max(1, minutes)}m`;
}

export default function FriendsPage() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [activity, setActivity] = useState<FriendActivity[]>([]);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<number | null>(null);
  const [nudgingId, setNudgingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [nextConnections, nextActivity] = await Promise.all([
        social.connections(),
        social.activity(),
      ]);
      setConnections(nextConnections);
      setActivity(nextActivity);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load friends");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(load, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function sendRequest(event: FormEvent) {
    event.preventDefault();
    if (!email.trim()) return;
    setError(null);
    try {
      await social.request(email.trim());
      setEmail("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send request");
    }
  }

  async function respond(connection: Connection, action: "accept" | "decline") {
    setWorkingId(connection.friendshipId);
    setError(null);
    try {
      await social.respond(connection.friendshipId, action);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update request");
    } finally {
      setWorkingId(null);
    }
  }

  async function remove(connection: Connection) {
    setWorkingId(connection.friendshipId);
    setError(null);
    try {
      await social.remove(connection.friendshipId);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not remove connection");
    } finally {
      setWorkingId(null);
    }
  }

  async function nudge(connection: Connection) {
    setNudgingId(connection.user.id);
    setError(null);
    try {
      await social.nudge(connection.user.id);
      toast.add({
        type: "success",
        title: `Nudged ${displayName(connection.user.name, connection.user.email)}`,
        description: "They'll see it in their notifications.",
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send nudge");
    } finally {
      setNudgingId(null);
    }
  }

  const incoming = connections.filter((item) => item.direction === "incoming");
  const others = connections.filter((item) => item.direction !== "incoming");

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[340px_1fr]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="text-muted-foreground size-4" />
              Add a friend
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form className="flex gap-2" onSubmit={sendRequest}>
              <Input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Friend's exact email"
                aria-label="Friend's email"
                required
              />
              <Button type="submit">Send</Button>
            </form>
            {error && <p className="text-destructive mt-3 text-sm">{error}</p>}
          </CardContent>
        </Card>

        {incoming.length > 0 && (
          <Card>
            <CardHeader><CardTitle>Friend requests</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {incoming.map((connection) => (
                <div key={connection.friendshipId} className="flex items-center gap-3">
                  <Avatar avatar={connection.user.avatar} className="size-9 rounded-full" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {displayName(connection.user.name, connection.user.email)}
                    </p>
                    {connection.user.name && (
                      <p className="text-muted-foreground truncate text-xs">{connection.user.email}</p>
                    )}
                  </div>
                  <Button size="icon-sm" aria-label="Accept request" disabled={workingId === connection.friendshipId} onClick={() => respond(connection, "accept")}><Check /></Button>
                  <Button size="icon-sm" variant="ghost" aria-label="Decline request" disabled={workingId === connection.friendshipId} onClick={() => respond(connection, "decline")}><X /></Button>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Users className="text-muted-foreground size-4" />Connections</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {!loading && others.length === 0 && <p className="text-muted-foreground text-sm">No connections yet.</p>}
            {others.map((connection) => (
              <div key={connection.friendshipId} className="flex items-center gap-3">
                <Avatar avatar={connection.user.avatar} className="size-9 rounded-full" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{displayName(connection.user.name, connection.user.email)}</p>
                  <p className="text-muted-foreground text-xs">{connection.direction === "outgoing" ? "Request sent" : "Friend"}</p>
                </div>
                {connection.direction === "friend" && (
                  <Button
                    size="icon-sm"
                    variant="outline"
                    aria-label={`Nudge ${displayName(connection.user.name, connection.user.email)}`}
                    disabled={nudgingId === connection.user.id}
                    onClick={() => nudge(connection)}
                  >
                    <Zap />
                  </Button>
                )}
                <Button size="sm" variant="ghost" disabled={workingId === connection.friendshipId} onClick={() => remove(connection)}>
                  {connection.direction === "outgoing" ? "Cancel" : "Remove"}
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="h-fit">
        <CardHeader><CardTitle>Friend activity</CardTitle></CardHeader>
        <CardContent>
          {!loading && activity.length === 0 && (
            <div className="py-12 text-center">
              <Users className="text-muted-foreground mx-auto mb-3 size-8" />
              <p className="font-medium">No friend activity yet</p>
              <p className="text-muted-foreground mt-1 text-sm">Add a friend to see what they are working on.</p>
            </div>
          )}
          <ul className="divide-y">
            {activity.map((item) => (
              <li key={item.id} className="flex gap-3 py-4 first:pt-0 last:pb-0">
                <Avatar avatar={item.user_avatar} className="size-10 rounded-full" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <p className="font-medium">{displayName(item.user_name, item.user_email)}</p>
                    {!item.ended_at && (
                      <span className="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-xs">Working now</span>
                    )}
                  </div>
                  <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-2 text-sm">
                    <ProjectIcon icon={item.project_icon} className="size-4" />
                    <span>{item.project_name || "No project"}</span>
                    <span aria-hidden>·</span>
                    <Clock3 className="size-3.5" />
                    <span>{formatDuration(item.duration_seconds, item.started_at)}</span>
                    <span aria-hidden>·</span>
                    <time dateTime={item.started_at}>{new Date(item.started_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</time>
                  </div>
                  {item.description && <p className="mt-2 text-sm">{item.description}</p>}
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

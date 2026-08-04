"use client";

import { useEffect, useState } from "react";
import { Copy, KeyRound, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, apiTokens, type ApiToken } from "@/lib/api";

function displayTime(value: string | null) {
  if (!value) return "Never used";
  const time = new Date(`${value.replace(" ", "T")}Z`);
  return Number.isNaN(time.getTime()) ? value : time.toLocaleString();
}

export function ApiTokenSettings() {
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [name, setName] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [revealedToken, setRevealedToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [revokingId, setRevokingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    void apiTokens.list()
      .then((result) => {
        if (current) setTokens(result);
      })
      .catch((caught) => {
        if (current) setError(caught instanceof ApiError ? caught.message : "Could not load API tokens");
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, []);

  async function createToken(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setError(null);
    setStatus(null);
    try {
      const created = await apiTokens.create({
        name,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      });
      setTokens((current) => [created, ...current]);
      setRevealedToken(created.token);
      setName("");
      setExpiresAt("");
      setStatus("API token created. Copy it now; it will not be shown again.");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not create API token");
    } finally {
      setCreating(false);
    }
  }

  async function copyToken() {
    if (!revealedToken) return;
    try {
      await navigator.clipboard.writeText(revealedToken);
      setStatus("API token copied to the clipboard.");
    } catch {
      setError("Could not copy the API token. Select and copy it manually.");
    }
  }

  async function revokeToken(token: ApiToken) {
    setRevokingId(token.id);
    setError(null);
    try {
      await apiTokens.revoke(token.id);
      setTokens((current) => current.filter((item) => item.id !== token.id));
      setStatus(`${token.name} was revoked.`);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not revoke API token");
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="text-muted-foreground size-4" />
          API tokens
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="max-w-2xl space-y-1">
          <p className="text-sm font-medium">Let a trusted agent use Sentinel</p>
          <p className="text-muted-foreground text-sm">Tokens have the same access as you. Treat them like passwords and revoke one when a device or agent no longer needs it.</p>
        </div>
        <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={createToken}>
          <div className="grid min-w-0 flex-1 gap-2">
            <Label htmlFor="api-token-name">Token name</Label>
            <Input id="api-token-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={100} placeholder="Claude Code on laptop" disabled={creating} required />
          </div>
          <div className="grid min-w-0 gap-2">
            <Label htmlFor="api-token-expiry">Expiry (optional)</Label>
            <Input id="api-token-expiry" type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} disabled={creating} />
          </div>
          <Button type="submit" disabled={creating || !name.trim()}>{creating ? "Creating..." : "Create token"}</Button>
        </form>
        {revealedToken && (
          <div className="animate-in fade-in-0 slide-in-from-top-1 space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 duration-150" role="status">
            <p className="text-sm font-medium">Copy this token now. It will not be shown again.</p>
            <code className="bg-background block overflow-x-auto rounded-md p-2 text-xs">{revealedToken}</code>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={copyToken}><Copy /> Copy token</Button>
              <Button type="button" variant="ghost" onClick={() => setRevealedToken(null)}>Dismiss</Button>
            </div>
          </div>
        )}
        {error && <p className="text-destructive text-sm" role="alert">{error}</p>}
        {status && <p className="text-sm text-emerald-700 dark:text-emerald-400" role="status">{status}</p>}
        <div className="space-y-2 border-t pt-4" aria-busy={loading}>
          <p className="text-sm font-medium">Active tokens</p>
          {loading ? <p className="text-muted-foreground text-sm">Loading tokens...</p> : tokens.length === 0 ? (
            <p className="text-muted-foreground text-sm">No API tokens yet.</p>
          ) : (
            <ul className="divide-y rounded-md border" aria-label="Active API tokens">
              {tokens.map((token) => (
                <li key={token.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{token.name}</p>
                    <p className="text-muted-foreground text-xs">Last used: {displayTime(token.lastUsedAt)} · {token.expiresAt ? `Expires: ${displayTime(token.expiresAt)}` : "Never expires"}</p>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger render={<Button type="button" variant="destructive" size="sm" disabled={revokingId === token.id} />}>
                      <Trash2 /> {revokingId === token.id ? "Revoking..." : "Revoke"}
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Revoke {token.name}?</AlertDialogTitle>
                        <AlertDialogDescription>Any agent or device using this token will immediately lose access to Sentinel.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction variant="destructive" onClick={() => revokeToken(token)}>Revoke token</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

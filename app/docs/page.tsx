import Link from "next/link";

export const metadata = {
  title: "Sentinel API v1",
  description: "Use Sentinel's personal API tokens to read history and manage your backlog and plans.",
};

const endpoints = [
  ["GET", "/auth/me", "Read the authenticated account"],
  ["POST", "/auth/tokens", "Create a named personal API token"],
  ["GET", "/auth/tokens", "List token metadata; secret values are never returned"],
  ["DELETE", "/auth/tokens/:id", "Revoke a token immediately"],
  ["GET", "/sessions?limit=…&cursor=…", "List session history"],
  ["GET", "/sessions/active", "Read the active session"],
  ["POST", "/sessions/start", "Start a focus session"],
  ["PATCH", "/sessions/:id", "Update or finish a session"],
  ["GET", "/projects", "List projects"],
  ["POST", "/projects", "Create a project"],
  ["PATCH / DELETE", "/projects/:id", "Update or remove an archived project"],
  ["GET", "/tasks", "List every task"],
  ["GET", "/tasks/backlog", "List incomplete, unscheduled tasks"],
  ["POST", "/tasks", "Create a task; omit periodStart for the backlog"],
  ["POST", "/tasks/backlog", "Move past incomplete tasks to the backlog"],
  ["PATCH / DELETE", "/tasks/:id", "Edit, schedule, complete, or delete a task"],
  ["GET", "/notes", "List day, week, and long-term notes"],
  ["PUT / DELETE", "/notes/:scope/:dateKey", "Write or remove a day, week, or long-term note"],
  ["GET", "/planned-sessions?date=YYYY-MM-DD", "Read a day’s planned focus sessions"],
  ["POST", "/planned-sessions", "Create a planned focus session"],
  ["PATCH / DELETE", "/planned-sessions/:id", "Edit or delete a plan"],
  ["PATCH", "/planned-sessions/reorder", "Reorder a day’s plans"],
  ["POST", "/planned-sessions/:id/start", "Start a planned session"],
  ["GET", "/reports/weekly?timezone=IANA", "Read weekly activity reports"],
  ["POST / DELETE", "/calendar/token", "Create or revoke a calendar-feed credential"],
  ["GET", "/calendar/feed?token=…", "Download the public iCalendar feed"],
  ["GET / POST / PATCH / DELETE", "/social/*", "Manage friends, activity, nudges, and notifications"],
  ["POST", "/noise-usage/start", "Start private focus-audio usage tracking"],
  ["POST", "/noise-usage/:id/heartbeat or /stop", "Update or end focus-audio tracking"],
] as const;

function Code({ children }: { children: string }) {
  return <pre className="overflow-x-auto rounded-lg border bg-muted/40 p-4 text-xs leading-6"><code>{children}</code></pre>;
}

export default function ApiDocsPage() {
  return (
    <main className="mx-auto w-full max-w-5xl space-y-10 px-4 py-10 sm:px-6 lg:py-16">
      <header className="space-y-4 border-b pb-8">
        <Link href="/" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">← Sentinel</Link>
        <p className="text-sm font-medium text-primary">Developer documentation</p>
        <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">Sentinel API v1</h1>
        <p className="max-w-3xl text-muted-foreground">Use a personal API token to let a trusted local agent read your activity and manage your Sentinel backlog and plans.</p>
      </header>

      <section className="space-y-4" aria-labelledby="authentication">
        <h2 id="authentication" className="font-heading text-xl font-semibold">Authentication</h2>
        <p className="text-muted-foreground">Sign in to Sentinel, open Settings, and create a named token under API tokens. Copy it when it is shown: Sentinel stores only a hash and cannot display it again. Tokens never expire unless you set an expiry.</p>
        <Code>{`export SENTINEL_BASE_URL="https://sentinel.yesvus.com"
export SENTINEL_API_TOKEN="sent_v1_…"

curl "$SENTINEL_BASE_URL/api/v1/projects" \\
  -H "Authorization: Bearer $SENTINEL_API_TOKEN"`}</Code>
        <p className="text-muted-foreground">Use HTTPS in hosted environments. Never include a token in a URL, commit it to a repository, or send it to an untrusted agent. Revoking it in Settings takes effect immediately.</p>
      </section>

      <section className="space-y-4" aria-labelledby="workflows">
        <h2 id="workflows" className="font-heading text-xl font-semibold">Core workflows</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2"><h3 className="font-medium">Inspect recent work</h3><Code>{`curl "$SENTINEL_BASE_URL/api/v1/sessions?limit=20" \\
  -H "Authorization: Bearer $SENTINEL_API_TOKEN"

# Response: { "items": [{ "id": 42, "startedAt": "…", "durationSeconds": 3600 }], "nextCursor": null }`}</Code></div>
          <div className="space-y-2"><h3 className="font-medium">Add to the backlog</h3><Code>{`curl -X POST "$SENTINEL_BASE_URL/api/v1/tasks" \\
  -H "Authorization: Bearer $SENTINEL_API_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"title":"Review the experiment results"}'

# Response: { "id": 17, "period_start": null, "title": "Review the experiment results" }`}</Code></div>
          <div className="space-y-2"><h3 className="font-medium">Read tomorrow’s plan</h3><Code>{`curl "$SENTINEL_BASE_URL/api/v1/tasks" -H "Authorization: Bearer $SENTINEL_API_TOKEN"
curl "$SENTINEL_BASE_URL/api/v1/notes" -H "Authorization: Bearer $SENTINEL_API_TOKEN"
curl "$SENTINEL_BASE_URL/api/v1/planned-sessions?date=2026-08-05" \\
  -H "Authorization: Bearer $SENTINEL_API_TOKEN"`}</Code></div>
          <div className="space-y-2"><h3 className="font-medium">Schedule a task</h3><Code>{`curl -X PATCH "$SENTINEL_BASE_URL/api/v1/tasks/17" \\
  -H "Authorization: Bearer $SENTINEL_API_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"periodStart":"2026-08-05"}'

# Response: { "id": 17, "period_start": "2026-08-05", "completed_at": null }`}</Code></div>
        </div>
      </section>

      <section className="space-y-4" aria-labelledby="reference">
        <h2 id="reference" className="font-heading text-xl font-semibold">Endpoint reference</h2>
        <p className="text-muted-foreground">All paths below are relative to <code>/api/v1</code>. Protected routes accept a browser session cookie or the bearer header above. JSON errors use <code>{'{ "error": "…" }'}</code> with an appropriate 4xx or 5xx status.</p>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-180 text-left text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground"><tr><th className="p-3 font-medium">Method</th><th className="p-3 font-medium">Path</th><th className="p-3 font-medium">Purpose</th></tr></thead>
            <tbody className="divide-y">{endpoints.map(([method, path, purpose]) => <tr key={`${method}-${path}`}><td className="p-3 font-mono text-xs">{method}</td><td className="p-3 font-mono text-xs">{path}</td><td className="p-3 text-muted-foreground">{purpose}</td></tr>)}</tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3 border-t pt-8" aria-labelledby="calendar">
        <h2 id="calendar" className="font-heading text-xl font-semibold">Calendar feed migration</h2>
        <p className="text-muted-foreground">Calendar subscriptions now use <code>/api/v1/calendar/feed?token=…</code>. If you subscribed before API v1, create or copy the new link from Settings and replace the old Google Calendar subscription.</p>
      </section>
    </main>
  );
}

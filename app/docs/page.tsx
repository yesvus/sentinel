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

      <section className="space-y-4" aria-labelledby="agent-setup">
        <h2 id="agent-setup" className="font-heading text-xl font-semibold">Set up any agent</h2>
        <p className="text-muted-foreground">Sentinel&apos;s agent guide is ordinary Markdown, so it works with formal skill systems and agents that only accept project instructions or attached context. It does not depend on a particular vendor or folder name.</p>
        <ol className="list-decimal space-y-2 pl-5 text-muted-foreground">
          <li>Create a personal API token in Sentinel Settings. Copy it once and keep it in your agent&apos;s approved secret store.</li>
          <li>Download the canonical guide into the project or workspace where the agent runs.</li>
          <li>Add that file to the agent&apos;s persistent instructions, skill folder, or startup context, then tell the agent to read it before calling Sentinel.</li>
        </ol>
        <Code>{`curl -fsSL https://raw.githubusercontent.com/yesvus/sentinel/master/SKILL.md \\
  -o sentinel-skill.md

export SENTINEL_BASE_URL="https://sentinel.yesvus.com"
export SENTINEL_API_TOKEN="sent_v1_…"`}</Code>
        <p className="text-muted-foreground">Never put the token in the skill file, a repository, or a URL. Runners without automatic skill discovery can attach the complete <a className="underline underline-offset-3 hover:text-foreground" href="https://raw.githubusercontent.com/yesvus/sentinel/master/SKILL.md">raw SKILL.md</a> directly as project context.</p>
      </section>

      <section className="space-y-4" aria-labelledby="mental-model">
        <h2 id="mental-model" className="font-heading text-xl font-semibold">How Sentinel models work</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border p-4"><h3 className="font-medium">Projects and tasks</h3><p className="mt-1 text-sm text-muted-foreground">Projects organize work and may nest three levels deep. Tasks are either unscheduled backlog items or assigned to a local calendar day. A task&apos;s project is fixed after creation.</p></div>
          <div className="rounded-lg border p-4"><h3 className="font-medium">Plans and focus sessions</h3><p className="mt-1 text-sm text-muted-foreground">Planned sessions are intended focus blocks with selected tasks. Starting one creates the real active session and consumes the plan.</p></div>
          <div className="rounded-lg border p-4"><h3 className="font-medium">Notes and reports</h3><p className="mt-1 text-sm text-muted-foreground">Day, week, and long-term notes preserve planning context. Weekly reports summarize completed work but do not replace live task state.</p></div>
          <div className="rounded-lg border p-4"><h3 className="font-medium">Dates and ownership</h3><p className="mt-1 text-sm text-muted-foreground">Planning dates are local <code>YYYY-MM-DD</code> keys. Every protected record belongs to the authenticated user; treat server responses as authoritative.</p></div>
        </div>
      </section>

      <section className="space-y-4" aria-labelledby="agent-loop">
        <h2 id="agent-loop" className="font-heading text-xl font-semibold">A safe agent workflow</h2>
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <li className="rounded-lg border p-4"><p className="font-medium">1. Read</p><p className="mt-1 text-sm text-muted-foreground">Fetch current tasks, plans, sessions, and notes before reasoning about a change.</p></li>
          <li className="rounded-lg border p-4"><p className="font-medium">2. Explain</p><p className="mt-1 text-sm text-muted-foreground">State the useful constraint or trade-off when the owner needs to decide.</p></li>
          <li className="rounded-lg border p-4"><p className="font-medium">3. Change narrowly</p><p className="mt-1 text-sm text-muted-foreground">Apply only the requested mutation; do not invent ids, dates, or task membership.</p></li>
          <li className="rounded-lg border p-4"><p className="font-medium">4. Reconcile</p><p className="mt-1 text-sm text-muted-foreground">Use the response or re-read state. Surface errors instead of assuming success.</p></li>
        </ol>
        <p className="text-muted-foreground">Ask before deleting a task, project, note, planned session, session, or token. A task moved back to the backlog is detached from active and planned sessions; a plan should never be started while another session is active.</p>
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

      <section className="space-y-3" aria-labelledby="responses">
        <h2 id="responses" className="font-heading text-xl font-semibold">Response and error conventions</h2>
        <p className="text-muted-foreground">Task and note records use keys such as <code>period_start</code>, <code>completed_at</code>, <code>project_id</code>, and <code>date_key</code>. Task writes use camelCase; task creation prefers <code>projectId</code> but also accepts a returned <code>project_id</code> for a safe read-to-create round-trip. Other responses may use camelCase. Preserve server values rather than transforming or fabricating them on the client.</p>
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground"><li><code>401</code>: token is invalid, expired, or revoked—create a new token in Settings.</li><li><code>409</code>: current state conflicts with the change—read current state again before retrying.</li><li><code>429</code>: pause and retry later; do not repeatedly poll.</li></ul>
      </section>

      <section className="space-y-3 border-t pt-8" aria-labelledby="calendar">
        <h2 id="calendar" className="font-heading text-xl font-semibold">Calendar feed migration</h2>
        <p className="text-muted-foreground">Calendar subscriptions now use <code>/api/v1/calendar/feed?token=…</code>. If you subscribed before API v1, create or copy the new link from Settings and replace the old Google Calendar subscription.</p>
      </section>
    </main>
  );
}

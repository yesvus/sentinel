---
name: sentinel-api
description: Read Sentinel activity and manage its backlog and day or week plans through the personal API.
---

# Sentinel API

Use this skill only with the account owner’s explicit authorization. Configure these values outside the repository:

```sh
export SENTINEL_BASE_URL="https://sentinel.yesvus.com"
export SENTINEL_API_TOKEN="sent_v1_…"
```

Send the token only as an HTTP header. Never put it in a URL, a commit, terminal output intended for sharing, or a prompt to an untrusted service.

```sh
curl "$SENTINEL_BASE_URL/api/v1/projects" \
  -H "Authorization: Bearer $SENTINEL_API_TOKEN"
```

## Common intents

- “What have I done recently?” — `GET /api/v1/sessions?limit=20`, then optionally `GET /api/v1/reports/weekly?timezone=UTC`.
- “What is in my backlog?” — `GET /api/v1/tasks/backlog`.
- “Add this to my backlog.” — `POST /api/v1/tasks` with `{ "title": "…" }`. Omit `periodStart`.
- “Plan tomorrow.” — read `GET /api/v1/tasks`, `GET /api/v1/notes`, and `GET /api/v1/planned-sessions?date=YYYY-MM-DD`; then schedule tasks with `PATCH /api/v1/tasks/:id` and `{ "periodStart": "YYYY-MM-DD" }`. Write a note with `PUT /api/v1/notes/day/YYYY-MM-DD` and `{ "content": "…" }` when appropriate.
- “Create a focus block.” — `POST /api/v1/planned-sessions` with `dateKey`, `projectId`, `estimatedSeconds`, optional `description`, and `taskIds`.
- “Start the planned focus block.” — `POST /api/v1/planned-sessions/:id/start`.

Task responses use database-style keys such as `period_start`, `completed_at`, and `project_id`. Planned-session and session-start responses include an `id`; preserve server responses as authoritative.

## Mutation safety

Read current state before proposing or performing a destructive change. Ask before deleting a task, project, note, token, or planned session. When a request returns `{ "error": "…" }`, report the error and do not assume local state changed. A 401 means the token is invalid, expired, or revoked; ask the owner to create a new one in Sentinel Settings.

See `/docs` on the configured Sentinel host for the complete v1 endpoint reference and curl examples.

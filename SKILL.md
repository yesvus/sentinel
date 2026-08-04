---
name: sentinel-api
description: Understand Sentinel as a personal work system, read its activity and plans, and safely manage its backlog through API v1.
---

# Sentinel API

Use this skill only with the account owner’s explicit authorization. Sentinel is a personal work tracker: it records what the owner actually did, keeps an unscheduled backlog, and supports day and week planning.

## Setup

Configure these outside the repository and outside this skill file:

```sh
export SENTINEL_BASE_URL="https://sentinel.yesvus.com"
export SENTINEL_API_TOKEN="sent_v1_…"
```

Send the token only in the Authorization header. Never put it in a URL, commit it, print it in shared logs, or paste it into an untrusted prompt.

```sh
curl "$SENTINEL_BASE_URL/api/v1/projects" \
  -H "Authorization: Bearer $SENTINEL_API_TOKEN"
```

All API paths in this document are relative to `$SENTINEL_BASE_URL/api/v1`. Successful responses are JSON unless the status is `204 No Content`. Errors have the shape `{ "error": "…" }`.

## Sentinel mental model

- A **project** organizes work. Projects can be nested up to three levels; a task’s project is fixed when the task is created.
- A **task** is either in the backlog (`period_start: null`) or scheduled on a local calendar day (`period_start: "YYYY-MM-DD"`). `completed_at: null` means it remains open.
- A **note** holds planning context. Notes are scoped to a day, a week, or a long-term context.
- A **planned session** is an intended focus block for one day. It belongs to a project, has an estimate, and can include selected scheduled tasks. Starting it creates the real active session and removes the plan.
- A **session** is actual work. It is active while `ended_at` is `null`; its duration and completion data are authoritative only after the server returns them.
- A **report** is a computed summary of completed sessions. It is useful for patterns, not for reconstructing live task state.

Dates such as `periodStart` and `dateKey` are local calendar keys. Keep them as `YYYY-MM-DD`; do not derive them by slicing a UTC ISO timestamp.

## Agent operating loop

1. **Read first.** Fetch the current state that matters before recommending or applying a change.
2. **Explain briefly.** Summarize relevant work, constraints, or trade-offs to the owner when a decision is involved.
3. **Mutate narrowly.** Send only the requested change. Do not fabricate ids, timestamps, or membership from local assumptions.
4. **Use the response.** Treat the returned record as authoritative and re-read a collection if a multi-record change could affect planning state.
5. **Surface failures.** If a mutation returns an error, report it and do not claim the change happened.

Ask before deleting a task, project, note, planned session, session, or API token. Read-only requests and ordinary reversible planning edits can be performed directly when the owner asked for them.

## Core workflows

### Review recent work

```sh
curl "$SENTINEL_BASE_URL/api/v1/sessions?limit=20" \
  -H "Authorization: Bearer $SENTINEL_API_TOKEN"

curl "$SENTINEL_BASE_URL/api/v1/reports/weekly?timezone=Europe/Istanbul" \
  -H "Authorization: Bearer $SENTINEL_API_TOKEN"
```

Use sessions for concrete history—timing, duration, project, description, and completion state. Use weekly reports for trends such as total time, active days, and top project.

### Inspect and manage the backlog

```sh
# Open, unscheduled tasks
curl "$SENTINEL_BASE_URL/api/v1/tasks/backlog" \
  -H "Authorization: Bearer $SENTINEL_API_TOKEN"

# Add an unscheduled task
curl -X POST "$SENTINEL_BASE_URL/api/v1/tasks" \
  -H "Authorization: Bearer $SENTINEL_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Review the experiment results"}'
```

To schedule a task, patch its `periodStart`. To mark it done, patch `completed: true`. Moving a task to the backlog uses `periodStart: null`; this also detaches it from any live or planned session.

### Plan a day

For a target `YYYY-MM-DD`, read tasks, notes, and planned sessions together:

```sh
curl "$SENTINEL_BASE_URL/api/v1/tasks" -H "Authorization: Bearer $SENTINEL_API_TOKEN"
curl "$SENTINEL_BASE_URL/api/v1/notes" -H "Authorization: Bearer $SENTINEL_API_TOKEN"
curl "$SENTINEL_BASE_URL/api/v1/planned-sessions?date=YYYY-MM-DD" \
  -H "Authorization: Bearer $SENTINEL_API_TOKEN"
```

Schedule a task with `PATCH /tasks/:id` and `{ "periodStart": "YYYY-MM-DD" }`. Save a day note with `PUT /notes/day/YYYY-MM-DD` and `{ "content": "…" }`. Save a week note with the same endpoint using `week` scope and the week’s date key.

Create a focus block with `POST /planned-sessions`:

```json
{
  "dateKey": "YYYY-MM-DD",
  "projectId": 12,
  "estimatedSeconds": 3600,
  "description": "Draft the outline",
  "taskIds": [34, 35]
}
```

Only attach eligible scheduled tasks. A task can belong to only one planned session. Start a chosen plan with `POST /planned-sessions/:id/start`; do not start another session if `GET /sessions/active` already returns one.

## Response conventions

Task and note records primarily use database-style keys such as `period_start`, `completed_at`, `project_id`, `date_key`, and `updated_at`. When creating a task, use camelCase request keys; `projectId` is preferred, and `project_id` is also accepted for safe task read-to-create round-trips. Other task write keys remain camelCase. Project, report, planned-session, and session mutation responses also include camelCase fields in places. Inspect the response rather than assuming a uniform naming style.

Common identifiers are numeric `id` values. `null` has meaning: an absent project, unscheduled task, uncompleted task, or active session end time is not a missing response field.

## Authentication and recovery

- `401` means the token is invalid, expired, or revoked. Ask the owner to create a new token in Sentinel Settings.
- `403` means the request was rejected by an ownership or origin rule. Do not retry with altered ownership data.
- `404` means the requested record is unavailable to this user. Do not infer that another user owns it.
- `409` means the current state conflicts with the requested change, often because a session is already active or a project cannot be changed that way. Re-read state before suggesting the next action.
- `429` means the token request rate limit was reached. Pause and retry later; do not spin.

## Portable installation

This is ordinary Markdown with YAML front matter, so it works with agents that support formal skills and agents that only support project instructions or attached context.

1. Download the canonical file:

   ```sh
   curl -fsSL https://raw.githubusercontent.com/yesvus/sentinel/master/SKILL.md -o sentinel-skill.md
   ```

2. Add that file to your agent’s persistent project instructions, skill directory, or startup context—whichever mechanism the runner supports.
3. Supply `SENTINEL_BASE_URL` and `SENTINEL_API_TOKEN` through environment variables or an approved secret store. Do not place either secret in `sentinel-skill.md`.
4. Instruct the agent to read the skill before it calls Sentinel.

For the full endpoint reference and human-readable examples, open `$SENTINEL_BASE_URL/docs`.

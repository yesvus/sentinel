# Planned sessions design

## Goal

Let users plan complete focus sessions for a calendar day, then start one as a single unit. A plan includes a project, estimated duration, optional explanation, ordered position, and zero or more tasks.

## Scope

- Create, edit, reorder, move, and remove planned sessions on the day-planning page.
- Show planned sessions before unbound tasks in the matching project group on Today.
- Start a selected plan through the existing active-session flow.
- Preserve the existing ad-hoc task selection flow for unbound tasks.

Session estimates are planning metadata only. History and statistics continue to report actual session durations only.

## Data model

Add a `planned_sessions` table owned by a user, with:

- `id`, `user_id`, `date_key`, `project_id`
- `estimated_seconds`, nullable `description`, and `sort_order`
- `created_at` and `updated_at`

Add `planned_session_tasks`, a join table between plans and tasks. A unique constraint on `(date_key, task_id)` ensures a task can occur in at most one plan on a given day. The service validates that every bound task is owned by the user, belongs to the plan's date, and is unfinished.

The API returns a plan with its ordered bound tasks. A dedicated planned-sessions server route module owns validation, authorization, transactions, and lifecycle mutations. Its browser client lives under `lib/api/`.

## Lifecycle

- Creating or editing a plan atomically replaces its task membership.
- Deleting or skipping a plan deletes the plan and releases its tasks into the ordinary unbound tasks for that day.
- Moving a plan changes the plan's day and moves all its bound tasks to the same day in one transaction.
- Starting a plan atomically creates the ordinary active session with the plan's project, description, and complete task set, then removes the plan. The timer does not stop automatically when its estimate elapses.
- If start fails, the plan and its selection stay visible; the UI restores its optimistic state and announces the error.

## Day planning UI

The day-planning page adds a planned-sessions area before its normal planned-task list. It provides controls to create, edit, reorder with keyboard support, move to another day, and remove a plan.

The editor captures project, estimate, explanation, and tasks. The task picker identifies tasks already assigned to another plan that day and prevents assigning them again. It permits zero-task plans.

Mutations apply optimistic local updates where a safe rollback exists, reconcile with the server response, and provide loading and error feedback. A previous request cannot overwrite a newer mutation.

## Today UI

The home model derives plans and unbound tasks from the authoritative home response. For every project group, Today renders planned sessions first, followed by the group's unbound open tasks.

A planned session is one selectable, accessible card showing its project context, estimate, optional explanation, and bound task rows. Clicking its header, content, or any bound task selects the complete plan; its tasks cannot be independently selected from Today. Only one plan can be selected at a time. Selecting ordinary unbound tasks clears any selected plan, and selecting a plan clears ordinary task selection.

Starting a selected plan uses the current optimistic start transition into the active Tasks widget. Unbound tasks retain existing multi-select, drag, and ad-hoc start behavior.

## Components and state

- The day page owns its planned-session collection and performs local optimistic reconciliation.
- Focused planning components render the plan list and plan editor; they do not own duplicate server state.
- A pure helper derives per-project Today groups and plan selection display state.
- The existing active-session context remains the sole owner of live timer state.

## Error handling and accessibility

- Use native buttons and labelled form fields throughout; all plan controls are keyboard operable.
- The selected plan exposes clear selected state beyond color alone.
- Loading controls are disabled while their request is in flight.
- Inline errors or accessible toast/status feedback expose load and mutation failures.
- Existing reduced-motion handling applies to plan-list transitions.

## Tests

- Database migration compatibility and indexes.
- Route integration tests for validation, ownership, atomic task binding, move, delete, and start behavior.
- Unit tests for plan/group derivation and lifecycle rules.
- Component tests for whole-card selection, unavailable task-picker items, delete/move behavior, loading state, and failed optimistic start rollback.

## Out of scope

- Auto-stopping a timer at the estimated duration.
- Showing planned estimates in historical reports or statistics.
- Assigning one task to multiple plans on the same day.

# Sentinel Engineering Guide

These instructions apply to the entire repository. Keep them focused on durable project conventions;
temporary implementation notes belong in the relevant GitHub issue or pull request.

<!-- BEGIN:nextjs-agent-rules -->

# Next.js: ALWAYS read docs before coding

Before any Next.js work, find and read the relevant doc in `node_modules/next/dist/docs/`. Your training
data is outdated; the bundled docs matching the installed version are the source of truth.

<!-- END:nextjs-agent-rules -->

## Backlog

Feature requests, roadmap ideas, and work not tied to the current change go to GitHub issues in this
repository. Do not add product or engineering work to the app's Tasks/Backlog UI: that is the user's
personal task list.

## Development Commands

Use the package manager pinned in `package.json`.

- `pnpm test`: run the complete Vitest suite.
- `pnpm typecheck`: run TypeScript without emitting files.
- `pnpm lint`: run ESLint across the repository.
- `pnpm build`: create the production Next.js build.

Run focused tests while iterating. Before committing a substantial change, run the complete test,
typecheck, and lint commands. Run the production build for routing, server, dependency, or deployment
changes.

## Architecture

- Route pages coordinate data and compose sections. Move substantial presentation into focused
  components and pure transformation logic into `lib/` modules.
- Give each domain state one clear owner. Consumers must derive from or subscribe to that owner rather
  than maintaining independent live copies, timers, or synchronization channels.
- Keep API route entrypoints limited to request-wide guards, authentication, dispatch, and shared error
  handling. Domain validation, queries, and mutations belong in `lib/server/routes/`.
- Keep browser API clients separated by domain under `lib/api/`; preserve `lib/api.ts` as the convenient
  public barrel.
- Centralize mutation semantics that must behave consistently across screens. Keep filtering,
  presentation, animation, and user-facing error placement local to each surface.
- Prefer small pure helpers over large controller abstractions. Do not reduce a file's size by creating a
  replacement god hook, `*Manager`, or flag-heavy universal component.
- Avoid cross-domain imports between server route modules. Shared transport, validation, ownership, and
  rate-limit primitives belong in neutral modules.

## File Size And Complexity

Line count is a review signal, not an automatic design rule.

- Review app-owned files approaching 300 lines for mixed responsibilities.
- Files over 400 lines require a clear cohesion reason and should not grow without an extraction plan.
- Generated code and UI primitives maintained as external-style building blocks are exempt.
- Prefer extraction when a file combines data loading, domain mutations, synchronization, dialogs, and
  multiple independent presentation sections.
- A cohesive file is better than several tightly coupled files with large prop surfaces. Split by domain
  responsibility, not by arbitrary line ranges.

## Data And Mutations

- Use optimistic UI by default for reversible user actions: apply the expected local state immediately,
  confirm it with the server in the background, reconcile with the authoritative response, and roll back
  with visible feedback if the request fails. Do not block interaction or animation on network latency
  when a safe rollback is possible. Destructive, security-sensitive, or non-reversible operations remain
  confirmation-first.
- Treat server responses as authoritative. Do not fabricate timestamps, durations, task membership, or
  normalized records on the client when the API can return them.
- Multi-record mutations that must succeed together must use an atomic database batch or transaction.
- Distinguish loading failure from an authoritative empty collection. Never allow a failed membership
  load to become a destructive empty update.
- Mutation failures must remain visible to the user and must not silently update local collections.
- Invalidate or sequence stale requests so an older response cannot overwrite a newer mutation.
- Preserve local-time calendar behavior. Do not format date/time inputs by slicing UTC ISO strings.

## Next.js And React

- Use the App Router conventions already established under `app/`.
- Default to Server Components. Add `"use client"` only when a module needs browser APIs, effects,
  event handlers, or client context.
- Keep client boundaries narrow; do not move server-only database, authentication, or secret handling
  into client bundles.
- Treat route `params`, `searchParams`, `cookies()`, and other request APIs according to the asynchronous
  APIs used by the installed Next.js version.
- Use `next/link` and Next navigation APIs for application routing.
- Follow existing React patterns. Do not add `useMemo` or `useCallback` by default; use them when identity
  stability or expensive recomputation has a concrete purpose.
- Effects that fetch data must handle stale results or cancellation when dependencies can change.

## Vercel And Server Runtime

- Hosted deployments use Vercel and Turso. Do not rely on a writable or persistent local filesystem at
  runtime.
- Keep secrets server-side. Only variables intentionally safe for the browser may use the
  `NEXT_PUBLIC_` prefix.
- `TURSO_DATABASE_URL` is required in hosted environments, and remote Turso connections require
  `TURSO_AUTH_TOKEN`. Preserve the fail-fast validation in the database client.
- The API requires the Node.js runtime. Do not switch route handlers to Edge without verifying every
  dependency, especially database, crypto, and password hashing support.
- Assume server instances are ephemeral. Correctness cannot depend on process-local caches, timers, or
  singleton state surviving requests.
- Preserve request authorization and ownership checks server-side even when the UI hides an action.

## UI Conventions

- Pair actions and loading or state changes with an appropriate animation or transition. Prefer the
  existing `tw-animate-css` utilities (`animate-in`, `animate-out`, `fade-in`, `slide-in-from-*`, and
  duration/delay utilities) over new dependencies.
- Respect `prefers-reduced-motion` through the existing global handling.
- Preserve the established visual language and responsive behavior on desktop and mobile.
- Do not ship controls without disabled/loading states for in-flight operations.
- Errors must be observable through inline feedback, a toast, or another accessible status surface.

## Testing

- Add unit tests for shared transformations, date/time handling, mutation semantics, and policy logic.
- Add component tests for meaningful interactive boundaries and failure states; avoid snapshot-only tests.
- Add integration coverage when changing API authorization, validation, response shapes, database
  migrations, or multi-record mutations.
- Every bug fix should include a regression test when the behavior can be reproduced reliably.
- Keep the standard `pnpm test` command green under its normal parallel configuration.

## Database Migrations

- Existing migration numbers are immutable. Do not renumber, consolidate, or rewrite deployed
  migrations.
- Add new migrations as the next ordered module under `lib/server/db/migrations/`.
- Preserve base-schema-before-migrations and post-migration index creation.
- Mark a migration as applied only after its work succeeds. Add compatibility tests for historical schema
  shapes when a migration rebuilds or conditionally alters data.

## @dnd-kit Drag and Drop

The project uses `@dnd-kit/core` and `@dnd-kit/sortable` for drag-and-drop.

### When to use dnd-kit directly (project tree style)

- Complex drop logic with custom hit-testing (e.g. nesting projects via "before/after/inside")
- Need full control over drop indicators, drop policies, and DragOverlay visuals
- Multiple droppable types with custom collision detection

Use `useDraggable` for the drag source, `useDroppable` for drop targets. Put `useDraggable` on the entire row with `setActivatorNodeRef` on the grip button (handle pattern). Render a `DragOverlay` for a compact card following the cursor. Use `opacity-30` on the original row while dragging. For collision detection, write a custom `point-in-rect` hit test that filters droppables by cursor position (not center distance).

### When to use @dnd-kit/sortable (task list style)

- Flat lists within groups where items just reorder
- Use `useSortable` on each row, wrapping rows in `SortableContext` per group
- Use `PointerSensor` with `activationConstraint: { distance: 8 }` so clicks on checkboxes/buttons aren't mistaken for drags
- Use `arrayMove` from `@dnd-kit/sortable` in `onDragEnd` to compute the new order

### Optimistic reorder pattern (do NOT manage local state)

Do NOT maintain a separate `localOrder` state variable for optimistic reordering. Instead, call the parent's `onUpdated` callback for each task in the reordered array with updated `sort_order`. The parent holds the authoritative `taskList` state and will re-render with the new order. Fire the API call in the background; on failure, call `onUpdated` for each task with the original order to roll back.

```ts
// In handleDragEnd:
const reordered = arrayMove(sorted, fromIndex, toIndex).map((task, index) => ({
  ...task, sort_order: index,
}));
reordered.forEach((task) => onUpdated(task));
tasksApi.reorder(buildReorderPayload(reordered)).catch(() => {
  sorted.forEach((task) => onUpdated(task));
});
```

### Common failure modes

- **Items snap back after drop**: You're not updating the data order. Update sort_order on each item and call the parent's update callback. Do not wait for the API response.
- **Duplicate key errors**: `arrayMove` can swap items across project groups. Always check that dragged and target tasks have the same `project_id` before reordering.
- **Drag handle not working**: `@dnd-kit` requires `dragHandleProps` on a native DOM element (not a custom component wrapper). Use plain `<button>` or `<div>`.
- **Drag overlay offset from cursor**: `snapCenterToCursor` modifier centers the overlay on the cursor. For grip-based drags, use a custom modifier or let the overlay render naturally at the activator position.
- **Row disappears during drag**: `useSortable` applies a CSS transform and z-index to the element. The row stays in the DOM stream. Set `opacity` and `z-index` based on `isDragging` from the hook return.
- **React 19 flushSync in handlers**: Don't use `flushSync` inside dnd-kit callbacks (causes "called from inside a lifecycle method" error). Use optimistic state update pattern described above instead.
- **Branch connectors gap**: Use absolute-positioned divs with extended `top`/`bottom` values (negative) to overlap the `gap-2` spacing between rows. Never use SVG `preserveAspectRatio` with dynamic containers. Never use CSS `::before`/`::after` pseudo-elements for tree connectors — Tailwind can't resolve dynamic `:last-child` or `:first-of-type` patterns reliably.
- **Last child excess branch line**: Compute a `Set<number>` of last-child IDs by grouping projects by `parentId`, sorting children by `sortOrder`, and taking the last. Pass a `lastChild` boolean to each row to truncate the vertical line.
- **Nesting not working**: `closestCenter` picks the wrong droppable when children are close. Write a custom `hitTest` collision detector that does a point-in-rect check — only droppables whose rect contains the cursor Y (with ±4px tolerance) are candidates, then pick the closest by center distance.

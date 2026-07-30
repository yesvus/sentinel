# Authenticated data caching

Sentinel keeps authenticated HTTP responses `Cache-Control: no-store`; shared proxies and CDNs
must never cache them. The browser uses a memory-only cache, so descriptions and profile data are
not persisted to storage.

Freshness contracts:

- Active session: never cached; load on app open and revalidate on focus, visibility, and reconnect.
- Project hierarchy: 60 seconds; every mutation clears it.
- Session history and date-bounded statistics: 30 seconds; every session/project mutation clears it.
- Notes: 30 seconds; note mutations clear it.
- Finalized weekly reports: 10 minutes; snapshots are immutable and keyed by user, week, timezone,
  and calculation version.

Identical in-flight GET requests are deduplicated. Mutations clear all memory entries before the
request, favoring correctness over overly narrow invalidation. A `401`, logout/login mutation, or
observed account-ID change clears all user data immediately. Active-session state always comes from
the database; the client cache cannot create or resurrect a session.

The statistics page requests a bounded 14-week range. History uses stable cursor pages. Database
indexes cover session date/project access and project parent/archive access. Weekly historical
aggregation is computed once and persisted; a cache miss safely falls back to source session data.

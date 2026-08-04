# API v1 personal tokens design

## Goal

Give a Sentinel user a personal bearer token that an external agent can use to read activity and manage backlog and planning. Publish a stable, human- and agent-readable API contract at `/api/v1` and `/docs`.

## Route migration

Move the catch-all handler from `app/api/[...path]/route.ts` to `app/api/v1/[...path]/route.ts`. All browser API clients and calendar feed links use `/api/v1/*`. The legacy `/api/*` endpoint is removed without an alias or redirect; existing external calendar subscriptions must be updated by their owner.

The new versioned route continues to dispatch to the existing domain route modules. It does not duplicate queries, validation, ownership checks, or mutation logic. This makes the documented v1 paths the public compatibility surface while preserving the existing server domain boundaries.

## Token model and authentication

Migration 018 creates `api_tokens` with an integer id, owning user id, unique SHA-256 token hash, optional expiry, name, created timestamp, and last-used timestamp. Indexes support lookup by hash and listing a user’s tokens. Tokens are generated with cryptographically secure random bytes, use a recognisable Sentinel prefix, and the plaintext value is never stored or returned after initial creation.

Tokens are full access: no scopes or third-party client registrations in v1. They never expire by default, while token creation may set an optional expiry. Revocation deletes the stored hash and takes effect on the next request.

The shared user resolver first accepts a valid browser session cookie, preserving existing browser behavior. With no cookie, it parses exactly one `Authorization: Bearer <token>` credential, resolves an unexpired token to its owner, and records best-effort last use. Invalid, expired, malformed, or revoked credentials return the existing 401 response. Raw bearer values are never logged or used as rate-limit keys; a derived hash is used instead. Token-authenticated requests use the existing neutral rate-limit primitives.

Because the v1 dispatcher resolves the user once and passes that user id to existing domain handlers, tokens automatically cover sessions, projects, notes, tasks/backlog, reports, calendar planning data, and planned-session CRUD/start.

## Token management

Authenticated endpoints manage a user’s own tokens. Creation validates a bounded name and optional future expiry, inserts only the hash, and returns public token metadata plus the plaintext token once. Listing returns metadata only: id, name, created time, last-used time, and expiry. Revocation deletes by both token id and authenticated user id; unknown or another user’s id does not disclose ownership.

Settings gains an API tokens section. Users can name a token, choose no expiry or an expiry, create it, copy the revealed value, then see active token metadata and revoke controls. Creation and revocation have disabled/in-flight states and accessible inline status or error feedback. The revealed value leaves the UI state when dismissed or the page reloads.

## Public documentation and agent skill

`/docs` is a public server-rendered page. It explains the base URL, bearer header, token issuance, error behavior, and all supported v1 endpoints with representative request and response examples. It includes runnable curl workflows to list and add backlog tasks, retrieve recent session history, and read or change a day/week plan. It never embeds a token or exposes user data.

Root `SKILL.md` is a concise Claude Agent Skill-format guide. It specifies where callers configure the base URL and token, requires sending the token only in the Authorization header, maps common agent intents to v1 endpoints, and describes the expected response shapes and safe mutation behavior.

## Testing and delivery

Integration tests exercise the moved v1 dispatcher, existing cookie authentication, bearer authentication, malformed and expired credentials, token revocation, and core task/planning access. Token endpoint tests verify one-time secret issuance, metadata-only listing, ownership checks, and immediate revocation. Existing calendar feed tests use the v1 URL. Unit tests cover token parsing and expiry validation if those helpers are extracted.

The implementation runs focused tests while iterating, then `pnpm test`, `pnpm typecheck`, `pnpm lint`, and a production build because routing changes. Commits are split by schema/auth API, UI/docs, and verification-compatible changes as appropriate.

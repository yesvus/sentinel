# Sentinel

A better study/work tracker app. Modern Pomodoro.

This project was built for the Web Programming course at the University of Catania (UNICT), under Professor Federico Fausto Santoro.

**Live demo:** [sentinel.yesvus.com](https://sentinel.yesvus.com)

## How to Use It

1. Go to [sentinel.yesvus.com](https://sentinel.yesvus.com) and register with an email and password (or log in if you already have an account).
2. On the Home page, optionally pick a project and write a short description of what you're about to work on.
3. Hit the play button to start the stopwatch. Study until you feel like stopping, no fixed timer.
4. Hit the square button to stop. Your session is saved automatically.
5. Check the Stats page for your activity heatmap, daily study chart, and time spent per project.
6. Manage your projects (add, rename, delete, pick an icon) from the Settings page.
7. Update your name, avatar, or password from the Profile page.

## Core Issue in Current Apps

Recent research suggests we focus in ultradian rhythms, so regular Pomodoro timers aren't the best fit. This app tries to be more suitable for those cycles.

## Our Approach

You start a stopwatch instead of a timer.

You stop when you feel finished. If you stick to a fixed timer, you might stop before you're actually out of energy, or push through after you should have stopped. This app aims to maximize your efficiency instead.

Note: this only works if you're self-regulated. You still need to actually want to study, the app just gets out of the way of a fixed timer instead of doing the discipline for you.

The most efficient study style for most people looks like:
70-120 min study -> 10-20 min break -> 70-120 min study again.

So when you're done or distracted, you start a break. When you feel ready, you start the timer again. Instead of fitting into a fixed frame, you define your own windows.

## Inspiration

The tracking model (start/stop, tag with a project, add a description, see stats broken down by project and by day) is inspired by time trackers like Toggl. Sentinel narrows that down specifically for solo studiers: instead of tracking billable hours across a team, it's built around respecting your own ultradian cycle.

## Tech Stack
- Next.js + React (TypeScript)
- shadcn/ui components (Tailwind CSS under the hood)
- Next.js Route Handlers for the same-origin REST API
- Turso for the DB
- Vercel for deployment

## Staying in sync across tabs/devices

Sentinel keeps an active study session in sync without a real-time server:

- **Local elapsed-time calculation**: the running stopwatch is just `now - startedAt` ticked client-side, no server push needed to keep it moving.
- **Client-cache updates after mutations**: starting/stopping/editing a session updates local state directly from the API response, so the tab that made the change never waits on a round-trip.
- **`BroadcastChannel` for same-browser tabs**: mutations are posted on a `BroadcastChannel`, so other tabs of the same browser pick them up instantly with no server involved at all.
- **Refetch-on-focus for cross-device sync**: when a tab regains focus or becomes visible, it re-fetches the lightweight `GET /api/sessions/active` endpoint to catch up with whatever happened on another device or browser while it was in the background.
- **One active session per user, enforced at the database level**: a partial unique index on `sessions` (one row with `ended_at IS NULL` per user) means concurrent start requests from different devices can't both succeed, no race condition possible. The loser gets back the session that's already running and adopts it instead of erroring.

This used to run on Socket.IO with a separate always-on Render process for the WebSocket server; that's been removed in favor of the above, which needs no persistent process to keep running.

## Project Structure
```
app/         Next.js pages and same-origin API Route Handler
components/  Application and UI components
lib/server/  Database and authentication modules
local.db     Local-development database
```

### Authentication

1. `POST /api/auth/register` or `/login`. Password is hashed with `bcrypt` (register) or compared against the hash (login).
2. On success, the server creates a cryptographically random opaque session token and sends it in an `httpOnly`, `SameSite=Strict` cookie.
3. Sentinel stores only a SHA-256 hash of that token and enforces expiry and revocation server-side. Password changes revoke all existing sessions.
4. Authentication throttling is stored in the database so it works across server instances.

### API Endpoints

| Method | Path | Auth required | Description |
|---|---|---|---|
| POST | `/api/auth/register` | no | Create an account |
| POST | `/api/auth/login` | no | Log in, sets the auth cookie |
| POST | `/api/auth/logout` | yes | Clears the auth cookie |
| GET | `/api/auth/me` | yes | Returns the current user |
| POST | `/api/sessions/start` | yes | Start a study session (optional `projectId`, `description`); `409` if one's already running |
| GET | `/api/sessions/active` | yes | The current active session, or `null` |
| PATCH | `/api/sessions/:id` | yes | Update a session's description/project |
| PATCH | `/api/sessions/:id/stop` | yes | Stop a session, server computes the duration |
| GET | `/api/sessions` | yes | List the logged-in user's sessions |
| GET | `/api/projects` | yes | List the logged-in user's projects |
| POST | `/api/projects` | yes | Create a project |
| PATCH | `/api/projects/:id` | yes | Rename a project |
| DELETE | `/api/projects/:id` | yes | Delete a project |

### Database Schema

```
users             Account, profile, privacy, audio and session defaults
auth_sessions     Hashed, expiring and revocable login sessions
projects          User-owned hierarchical projects
sessions          User-owned activity sessions and Learning/Producing allocation
notes             Daily and weekly notes
friendships       Pending and accepted social connections
weekly_reports    Immutable finalized weekly summaries
auth_rate_limits  Shared authentication and abuse throttling
schema_migrations Applied database schema versions
```

## Setup

Install dependencies and start the full application:

```
pnpm install
cp .env.example .env.local
pnpm dev
```

The UI and `/api/*` endpoints run together on `http://localhost:3000`.

For a hosted environment, create a Turso database:
```
turso auth login
turso db create sentinel
turso db show sentinel --url        # -> TURSO_DATABASE_URL
turso db tokens create sentinel     # -> TURSO_AUTH_TOKEN
```
Put those values into `.env.local`. Without Turso configuration, local development uses `local.db`.
Hosted Vercel deployments fail fast when `TURSO_DATABASE_URL` is absent, and remote
Turso connections require `TURSO_AUTH_TOKEN`.

Schema upgrades are versioned in `lib/server/db.ts`. Each version is recorded in
`schema_migrations`; migration failures are surfaced instead of silently ignored.

## License

[PolyForm Noncommercial 1.0.0](LICENSE). Free to view, use, and modify for noncommercial purposes. Commercial use requires a separate paid license, contact me.

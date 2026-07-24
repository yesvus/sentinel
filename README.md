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
- Node.js backend with a REST API (HTTP requests from the frontend to the backend)
- **Socket.IO for real-time updates** (see below)
- Turso for the DB
- Vercel + Render for deployment

## Real-time with Socket.IO

Sentinel uses **Socket.IO** so an active study session stays in sync live across every open tab or device for the same account. Start the stopwatch on your laptop, and it's already ticking on your phone or a second tab, no refresh needed.

- **Authenticated sockets**: the same JWT used for HTTP auth is read from the cookie during the socket handshake, verified, and each socket is joined into a private room (`user:<id>`) so events only ever reach that user's own connections.
- **Two deployment targets, one real-time layer**: the REST API runs on Vercel serverless functions (fast, always-on, no cold starts), but serverless functions can't hold a persistent WebSocket connection. So the Socket.IO server runs separately on **Render**, which supports a real long-lived Node process.
- **Decoupled by design**: because the API and the socket server are two separate processes, the socket server watches the database directly (a lightweight poll per connected client, a few times a second) instead of relying on the API process to push events to it directly. This means real-time sync keeps working correctly no matter which backend actually handled the write, and the core app (auth, sessions, projects) never depends on the real-time layer being up. If Render is asleep or slow, the site still works perfectly via the normal HTTP API, it just re-syncs the next time you load a page instead of pushing live.

## Project Structure
```
frontend/   Next.js app
backend/    Express API (auth + study sessions)
```

### Auth: JWT in an httpOnly cookie

1. `POST /api/auth/register` or `/login`. Password is hashed with `bcrypt` (register) or compared against the hash (login).
2. On success, the server signs a JWT (`jsonwebtoken`) containing the user's id and sends it back via a `Set-Cookie` header, marked `httpOnly` (so client-side JS can never read it, only the browser can send it automatically).
3. Every subsequent request automatically includes that cookie. A middleware (`requireAuth`) reads it, verifies the signature against `JWT_SECRET`, and attaches the user id to the request, or responds `401 Unauthorized` if it's missing/invalid.

### API Endpoints

| Method | Path | Auth required | Description |
|---|---|---|---|
| POST | `/api/auth/register` | no | Create an account |
| POST | `/api/auth/login` | no | Log in, sets the auth cookie |
| POST | `/api/auth/logout` | yes | Clears the auth cookie |
| GET | `/api/auth/me` | yes | Returns the current user |
| POST | `/api/sessions/start` | yes | Start a study session (optional `projectId`, `description`) |
| PATCH | `/api/sessions/:id` | yes | Update a session's description/project |
| PATCH | `/api/sessions/:id/stop` | yes | Stop a session, server computes the duration |
| GET | `/api/sessions` | yes | List the logged-in user's sessions |
| GET | `/api/projects` | yes | List the logged-in user's projects |
| POST | `/api/projects` | yes | Create a project |
| PATCH | `/api/projects/:id` | yes | Rename a project |
| DELETE | `/api/projects/:id` | yes | Delete a project |

### Database Schema

```
users     (id, email, password_hash, created_at)
projects  (id, user_id, name, created_at)
sessions  (id, user_id, started_at, ended_at, duration_seconds, description, project_id)
```

## Setup

### Backend
```
cd backend
pnpm install
cp .env.example .env   # fill in your own values, see below
pnpm dev                # runs on http://localhost:4000
```

You need a Turso database. If you don't have one yet:
```
turso auth login
turso db create sentinel
turso db show sentinel --url        # -> TURSO_DATABASE_URL
turso db tokens create sentinel     # -> TURSO_AUTH_TOKEN
```
Put those two values plus a random `JWT_SECRET` into `backend/.env`. If you skip Turso entirely, the backend falls back to a local SQLite file (`file:local.db`), so you can still develop without it.

### Frontend
```
cd frontend
pnpm install
pnpm dev                # runs on http://localhost:3000
```
By default the frontend proxies `/api/*` and `/socket.io/*` to `http://localhost:4000` (see `frontend/.env.local`). In production these point at separate `API_ORIGIN` (Vercel) and `REALTIME_ORIGIN` (Render) env vars.
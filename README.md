# Sentinel

A better study/work tracker app. Modern Pomodoro.

Started as a project for the Web Programming course at the University of Catania (UNICT), under Professor Federico Fausto Santoro.

**Live demo:** [sentinel.yesvus.com](https://sentinel.yesvus.com)

## How to Use It

1. Go to [sentinel.yesvus.com](https://sentinel.yesvus.com) and register with an email and password (or log in if you already have an account).
2. On the Home page, optionally pick a project and write a short description of what you're about to work on.
3. Hit the play button to start the stopwatch. Study until you feel like stopping, no fixed timer.
4. Hit the square button to stop. Your session is saved automatically.
5. Check the Stats page for your activity heatmap, daily study chart, and time spent per project.

## Tech Stack
- Next.js + React (TypeScript)
- shadcn/ui components (Tailwind CSS under the hood)
- Next.js Route Handlers for the same-origin REST API
- Turso for the DB
- Vercel for deployment

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

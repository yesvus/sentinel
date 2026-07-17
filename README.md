# Sentinel

A better study/work tracker app. Modern Pomodoro.

## Core Issue in Current Apps

Recent research suggests we focus in ultradian rhythms, so regular Pomodoro timers aren't the best fit. This app tries to be more suitable for those cycles.

## Our Approach

You start a stopwatch instead of a timer.

You stop when you feel finished. If you stick to a fixed timer, you might stop before you're actually out of energy, or push through after you should have stopped. This app aims to maximize your efficiency instead.

Note: this only works if you're self-regulated. You still need to actually want to study, the app just gets out of the way of a fixed timer instead of doing the discipline for you.

The most efficient study style for most people looks like:
70-120 min study -> 10-20 min break -> 70-120 min study again.

So when you're done or distracted, you start a break. When you feel ready, you start the timer again. Instead of fitting into a fixed frame, you define your own windows.

## Tech Stack
- Next.js (TypeScript)
- Node.js backend with a REST API (HTTP requests from the frontend to the backend)
- Turso for the DB
- Vercel for deployment

## Project Structure
```
frontend/   Next.js app
backend/    Express API (auth + study sessions)
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
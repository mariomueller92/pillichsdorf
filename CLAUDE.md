# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

"pillichsdorf-gastro" — a restaurant/bar point-of-sale system (waiter ordering, kitchen/bar display, admin, billing, table management). German is the working language throughout: UI strings, error messages, and log output are in German — match that when adding new user-facing text or server error messages.

Hosted on **Vercel** (client static build + Express app as a single serverless function) with **Postgres (Neon)** as the database. There is no persistent local filesystem or long-lived process on Vercel — see Architecture below for what that changes vs. a classic Node server.

## Commands

Run from repo root unless noted.

- `npm run dev` — runs server and client together (concurrently), against whatever `DATABASE_URL` points at (local Docker Postgres for dev)
- `npm run dev:server` / `npm run dev:client` — run one side only
- `npm run build` — builds the client only (`cd client && npm run build`, i.e. `tsc -b && vite build`)
- `npm start` — runs the server in prod mode (also serves `client/dist` statically) — used for non-Vercel/on-prem runs; on Vercel, `api/index.ts` + `vercel.json` handle this instead
- `npm run db:reset` — truncates and reseeds all tables (see Database below; requires `CONFIRM_RESET=yes`)
- `cd server && npm run migrate` — runs `tsx src/database.ts` directly (idempotent schema creation)
- `npm run print-agent` (or `cd server && npm run print-agent`) — starts the local print-agent poller (see Printer below); runs on the machine physically attached to the receipt printer, never on Vercel
- `docker compose up -d` — starts a local Postgres instance for dev (`docker-compose.yml` at repo root)

There is **no test suite and no linter/formatter configured** in this repo (no jest/vitest/mocha/playwright, no eslint/prettier config) — don't assume `npm test` or `npm run lint` exist.

## Architecture

### Server (`server/src`, Express 4 + TypeScript, run via `tsx` — no compiled build step for dev/start)

- `app.ts` — builds and exports the Express `app` (middleware + all routes), no `listen()` call — this is what both the local entry point and the Vercel function import.
- `index.ts` — local dev/prod entry point: imports `app` from `app.ts`, runs `runMigrations()`/`seedDefaultData()`, then `server.listen(...)`. Not used on Vercel.
- `routes/*.routes.ts` — one file per domain (auth, users, menu, tables, orders, billing, stats, jetonTypes, settings, printJobs). Routes are thin, all handlers `async`: `auth` middleware (JWT bearer) → optional `role([...])` middleware → zod `validate(schema)` middleware → `await` a `services/*.service.ts` function → `try/catch` → `next(err)`.
- `services/*.service.ts` — business logic and raw SQL (no ORM), all functions `async`.
- `middleware/` — `auth.ts` (JWT), `role.ts` (role gating), `printAgentAuth.ts` (shared-secret header auth for the print-agent, separate from user JWT), `validate.ts` (zod), `errorHandler.ts` (catches thrown `AppError(statusCode, message)`, otherwise returns a generic German 500).
- `printer/receipt.ts` — pure ESC/POS content-building (`ReceiptBuilder`, `sanitizeForPrint`, `toCp1252`) — no `child_process`/`fs`, safe to run inside a Vercel function.
- `printer/templates.ts` — builds a receipt via `receipt.ts` and enqueues it into the `print_jobs` table (`printJobs.service.ts`) instead of printing directly — runs server-side.
- `printer/index.ts` — the actual print *execution* (`execSync` + PowerShell raw-print script) — this only runs inside the local print-agent process (`print-agent/agent.ts`), never in the serverless server, since it needs a real Windows printer spooler.
- `print-agent/agent.ts` — standalone long-running Node process, started separately (e.g. as a Windows service on the machine at the bar), polls `GET /api/print-jobs/pending` and reports back via `POST /api/print-jobs/:id/complete|fail`.
- `shared/` — zod schemas, types, constants conceptually shared with the client (kept in sync by hand, not an actual shared package).
- `database.ts` — Postgres schema via idempotent `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, plus a named/idempotent data-migration system (`applied_migrations` table via `runDataMigration`). Also exports the query layer: `getPool()` (lazy `pg.Pool` singleton), `queryOne`/`queryAll`/`execute` (async, auto-translate `?` placeholders to `$1..$n`), and `withTransaction(fn)` (replaces the old synchronous `db.transaction()` pattern). `seedDefaultData()` inserts demo admin/users/tables/menu when empty.
- No connection-pool-per-request concerns beyond what `pg.Pool` handles — Vercel functions reuse a warm pool across invocations of the same container; use Neon's **pooled** connection string (PgBouncer-fronted) in `DATABASE_URL` for production.
- `pg` returns `bigint`/`numeric` aggregate results (COUNT/SUM) as strings by default; `database.ts` globally overrides the type parsers for OIDs 20 and 1700 to return JS numbers instead — keep that in mind if you add new aggregate queries (no extra `Number(...)` coercion needed, it's already numeric).

### Client (`client/src`, Vite 6 + React 19 + TypeScript, path alias `@/` → `src/`)

- `App.tsx` — defines all routes; role-scoped route groups wrapped in `AuthGuard` then `RoleGuard`. Also hosts the app-wide menu-availability poll (20s) and mounts `PrinterErrorWatcher`.
- `features/<domain>/` — feature-folder convention (waiter, kitchen, admin, auth, dashboard, stats), not a `pages/` split.
- `stores/` — zustand stores, one per domain (auth, menu, orders, settings, tables, ui).
- `api/` — axios wrapper per resource, mirroring server routes.
- `components/PrinterErrorWatcher.tsx` — polls `GET /api/print-jobs/failed-recent` and toasts newly-failed print jobs.
- `utils/notificationSound.ts` — shared "new order / item ready" chime, played from the polling loops in `OrderQueueView.tsx` (kitchen/bar) and `MyOrders.tsx` (waiter) by diffing item IDs between polls.
- `guards/` — `AuthGuard`, `RoleGuard`.
- Styling: Tailwind CSS 4 via `@tailwindcss/vite`.
- No Socket.IO / WebSocket client — realtime updates are all polling-based (see Realtime below).

### Realtime: polling, not Socket.IO

There is no Socket.IO server or client in this codebase (removed for Vercel compatibility — serverless functions can't hold persistent connections). Screens poll on their own interval instead:
- Kitchen/bar queue (`OrderQueueView.tsx`): 15s
- Waiter's own orders (`MyOrders.tsx`) / bar overview (`BarOverview.tsx`): 10s
- Table overview (`TableOverview.tsx`): 8s
- Menu availability (app-wide, `App.tsx`): 20s
- Printer failures (`PrinterErrorWatcher.tsx`): 15s

Offline detection is handled entirely by the axios interceptor in `client/src/api/client.ts` (network-error/timeout → `useUIStore.setOffline`), independent of any of the above.

### Data flow pattern

Client `api/*` (axios) hits server `routes/*.routes.ts` → `services/*.service.ts` → Postgres. There is no push channel — screens converge on server state within their own poll interval (see Realtime above).

## Deployment (Vercel)

- `api/index.ts` — the Vercel serverless function entry; imports and re-exports `app` from `server/src/app.ts` (no `listen()`, no boot migrations).
- `vercel.json` — `buildCommand`/`outputDirectory` build+serve the client as a static SPA; `rewrites` send `/api/*` to the function and everything else to `index.html` (SPA fallback).
- Migrations are **not** run automatically on deploy/cold-start — run `cd server && npm run migrate` against the target `DATABASE_URL` (e.g. a Neon branch) as part of your deploy process before traffic hits the new version.
- The print-agent (`server/src/print-agent/agent.ts`) is a separate, non-Vercel deployable — it must keep running on a machine with real access to the receipt printer, pointed at the deployed `SERVER_URL`.

## Environment

Config is loaded via `dotenv` in `server/src/config.ts` from a root-level `.env`. Keys in use: `PORT`, `HOST`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `DATABASE_URL` (Postgres connection string — Neon pooled URL in prod, local Docker Postgres in dev), `PRINTER_ENABLED`, `PRINT_AGENT_TOKEN` (shared secret between server and print-agent), `LOG_LEVEL`. `COMPANY_NAME`/`COMPANY_ADDRESS1/2`/`COMPANY_BETRIEBSNUMMER`/`COMPANY_FOOTER`/`PRINTER_NAME`/`PRINTER_WIDTH` are read once as first-run seed values only — company/printer info is otherwise DB-editable via the `settings` table/admin UI, not env-driven at runtime. The print-agent process itself additionally reads `SERVER_URL` and `PRINT_AGENT_TOKEN` (and optionally `PRINT_AGENT_POLL_MS`).

## Database backups

No local DB file exists anymore (Postgres/Neon), so there are no git-hook-triggered file backups. Rely on the Postgres provider's own backup/point-in-time-recovery (Neon) or branching for dev/staging snapshots.

## Notes

- Demo/dev credentials seeded by `seedDefaultData()` include an `admin`/`admin` login and PIN-based logins (e.g. `0000`, `9999`) — local dev only, never treat these as real secrets.
- The root `seed_menu_kgf_april26.sql` is a reference/export snapshot, not something executed directly by the app — actual seed data (the same KGF April 26 wine menu) lives in TypeScript in `database.ts`.

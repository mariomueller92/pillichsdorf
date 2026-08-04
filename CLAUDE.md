# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

"pillichsdorf-gastro" — a restaurant/bar point-of-sale system (waiter ordering, kitchen/bar display, admin, billing, table management). German is the working language throughout: UI strings, error messages, and log output are in German — match that when adding new user-facing text or server error messages.

## Commands

Run from repo root unless noted.

- `npm run dev` — runs server and client together (concurrently)
- `npm run dev:server` / `npm run dev:client` — run one side only
- `npm run build` — builds the client only (`cd client && npm run build`, i.e. `tsc -b && vite build`)
- `npm start` — runs the server in prod mode (also serves `client/dist` statically)
- `npm run db:reset` — wipes and reseeds the SQLite DB (see Database below; requires `CONFIRM_RESET=yes`)
- `npm run db:backup` — one-off manual DB snapshot (`node scripts/backup-db.mjs manual`)
- `npm run pull` — safety-backs up the DB, then `git pull` (protects local SQLite data from being clobbered by a pull)
- `cd server && npm run migrate` — runs `tsx src/database.ts` directly (schema creation/migrations)

There is **no test suite and no linter/formatter configured** in this repo (no jest/vitest/mocha/playwright, no eslint/prettier config) — don't assume `npm test` or `npm run lint` exist.

## Architecture

### Server (`server/src`, Express 4 + TypeScript, run via `tsx` — no compiled build step for dev/start)

- `routes/*.routes.ts` — one file per domain (auth, users, menu, tables, orders, billing, stats, jetonTypes, settings). Routes are thin: `auth` middleware (JWT bearer) → optional `role([...])` middleware → zod `validate(schema)` middleware → delegate to a `services/*.service.ts` function.
- `services/*.service.ts` — business logic and raw SQL (no ORM).
- `middleware/` — `auth.ts` (JWT), `role.ts` (role gating), `validate.ts` (zod), `errorHandler.ts` (catches thrown `AppError(statusCode, message)`, otherwise returns a generic German 500).
- `socket/index.ts` — Socket.IO server for realtime updates (e.g. order/table state pushed to waiter/kitchen screens).
- `printer/` — thermal receipt printer integration, including a PowerShell raw-print script (Windows print path).
- `shared/` — zod schemas, types, constants conceptually shared with the client (kept in sync by hand, not an actual shared package).
- `database.ts` — defines the whole schema via idempotent `CREATE TABLE IF NOT EXISTS`, plus `PRAGMA table_info()` checks with `ALTER TABLE ADD COLUMN` for incremental changes, plus a named/idempotent data-migration system tracked in an `applied_migrations` table. `seedDefaultData()` inserts demo admin/users/tables/menu when empty.
Database access is synchronous via `better-sqlite3` (SQLite, WAL mode, `foreign_keys=ON`) through a single `getDb()` singleton — no connection pool, no ORM. There is no separate migrations folder; schema evolution lives inline in `database.ts`.

### Client (`client/src`, Vite 6 + React 19 + TypeScript, path alias `@/` → `src/`)

- `App.tsx` — defines all routes; role-scoped route groups wrapped in `AuthGuard` then `RoleGuard`.
- `features/<domain>/` — feature-folder convention (waiter, kitchen, admin, auth, dashboard, stats), not a `pages/` split.
- `stores/` — zustand stores, one per domain (auth, menu, orders, settings, tables, ui).
- `api/` — axios wrapper per resource, mirroring server routes.
- `socket/` — Socket.IO client provider.
- `guards/` — `AuthGuard`, `RoleGuard`.
- Styling: Tailwind CSS 4 via `@tailwindcss/vite`.

### Data flow pattern

Client `api/*` (axios) hits server `routes/*.routes.ts` → `services/*.service.ts` → SQLite. Realtime state changes (new orders, table status, etc.) are additionally pushed over Socket.IO so waiter/kitchen/admin screens stay in sync without polling.

## Environment

Config is loaded via `dotenv` in `server/src/config.ts` from a root-level `.env` (no `.env.example` checked in). Keys in use: `PORT`, `HOST`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `DB_PATH`, `PRINTER_ENABLED`, `PRINTER_NAME`, `PRINTER_WIDTH`, `LOG_LEVEL`. `COMPANY_NAME`/`COMPANY_ADDRESS1/2`/`COMPANY_BETRIEBSNUMMER`/`COMPANY_FOOTER` are read once as first-run seed values only — company info is otherwise DB-editable via the `settings` table/admin UI, not env-driven at runtime.

## Git hooks and DB backups

`npm run prepare` sets `core.hooksPath=.githooks`. `.githooks/post-checkout` (on actual branch switches only) and `.githooks/post-merge` both call `scripts/backup-db.mjs` (non-blocking, `|| true`) to snapshot the local SQLite DB around any git operation that could change the working tree — this is why `npm run pull` also backs up before pulling. Backups use `VACUUM INTO` when possible (falls back to plain file copy) and are kept in `<dbDir>/backups/`, capped at the latest 50 per prefix (`manual`, `pre-pull`, `post-merge`, `post-checkout`).

## Notes

- Demo/dev credentials seeded by `seedDefaultData()` include an `admin`/`admin` login and PIN-based logins (e.g. `0000`, `9999`) — local dev only, never treat these as real secrets.
- The root `seed_menu_kgf_april26.sql` is a reference/export snapshot, not something executed directly by the app — actual seed data lives in TypeScript in `database.ts`.

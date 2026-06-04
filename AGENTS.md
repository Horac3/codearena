# AGENTS.md

Guidance for agents working in the CodeArena monorepo.

## Build & Test

```
npm run dev:api              → nest start --watch (port 3000)
npm run dev:web              → vite (port 5173)
npm run build:api            → nest build → dist/
npm run build:extension      → esbuild (not tsc), bundles to dist/extension.js
npm run lint                 → eslint --ext .ts in each workspace
npm run test                 → jest in each workspace
```

**Single test file:** `cd apps/api && npx jest path/to/file.test.ts`

**Integration tests** (requires Postgres + Redis):
```
docker compose -f docker-compose.test.yml up -d
cd apps/api && npm run test:e2e
```

**Extension type-check** (`esbuild` bundles; `tsc` is for type-check only):
```
cd apps/extension && npx tsc --noEmit
```
**Extension watch** (hot-reload during VS Code dev): `cd apps/extension && npm run watch`

**Validate question schemas:**
```
npm run validate --workspace=packages/question-schema
```
Or from root: `npx ts-node --project packages/question-schema/tsconfig.json packages/question-schema/src/validate-cli.ts questions/`

Duplicate ID detection: `node .github/scripts/check-duplicates.js`

**Type-check per workspace** (CI uses `tsc --noEmit`, not `build`):
```
cd apps/api       && npx tsc --noEmit
cd apps/extension && npx tsc --noEmit
```

**Build order matters:** `packages/question-schema` must be compiled (`tsc`) before API type-checking — API's tsconfig aliases `@codearena/question-schema` to its source.

**Prisma:** Schema at `apps/api/prisma/schema.prisma`. After schema changes, run `cd apps/api && npx prisma generate`. Migrations auto-run on container start via `entrypoint.sh` (`prisma migrate deploy`). Integration tests use `docker-compose.test.yml` (Postgres port 5433, Redis port 6380).

## Repo Structure

| Path | Role |
|---|---|
| `apps/api/` | NestJS REST + WebSocket (`/duel`) backend |
| `apps/extension/` | VS Code extension, esbuild-bundled, entry `src/extension.ts` |
| `apps/web/` | Static Vite landing page + invite handler |
| `packages/question-schema/` | Shared Question types, XP constants, CLI validator |
| `questions/` | Community question bank (JSON), read-only in Docker |
| `.github/workflows/ci.yml` | Source of truth for validation pipeline |

## Agent Guidance

- Prefer `apps/api` for backend bugs, `apps/extension` for editor UI/extension work, and `apps/web` for landing page or invite flow.
- Root `npm install` is usually sufficient. Run workspace commands from the correct package folder when needed.
- Local dev on Windows can use `start-local.ps1`; otherwise use `docker compose -f docker-compose.yml -f docker-compose.local.yml up -d` for Postgres + Redis.
- The repo does not rely on Prettier. Use ESLint formatting and keep edits consistent with existing style.
- `.env` = production config; `.env.local` = local dev (used by `docker-compose.local.yml`). Never commit either.
- When changing production-like behavior, consult `RULES.md` for auth, duels, ranking, or competition-sensitive logic.
- For question content changes, follow `CONTRIBUTING.md` and preserve the existing question schema conventions.

## Critical Patterns

- **Questions dir is mounted `:ro`** in Docker. API loads all JSON into memory at startup via `QuestionsService.onModuleInit()`. Never write at runtime.
- **All rank point changes MUST flow through `RankingService.awardPoints()`** (`apps/api/src/ranking/ranking.service.ts`). Direct `prisma.user.update({ rankPoints })` bypasses floor protection, audit logging (`RankEvent`), and tier recalculation.
- **Duel scoring is server-side only.** The answer key is stripped via `DuelService.stripAnswer()` before sending questions. Client `elapsedMs` is display-only.
- **Coding test files** receive the user's function as the global `solution` variable. Never `import`/`require` the solution — the execution harness injects it. Reference solutions live in `questions/coding/solutions/` which is **gitignored** — never committed.
- **Prisma migrations** run via `entrypoint.sh` on container start (`prisma migrate deploy`). Never run manually in production. After local schema changes, run `npx prisma generate`.
- **Redis cache keys** follow `resource:identifier` pattern with explicit TTLs. Daily sets: `daily:YYYY-MM-DD` (25h), duel rooms: `duel:roomId` (2h), leaderboard: `leaderboard:weekly` (5min).
- **Question IDs must be globally unique** across all topics. Format: `{topic}-{subtopic}-{NNN}` (e.g., `dsa-arrays-001`). CI validates via `check-duplicates.js`.
- **Daily set is seeded deterministically** via `seedrandom(date)` — same date = same questions worldwide.
- **Floor protection** prevents rank drops below tier minimum until 10 duels completed at current tier. Enforced in `RankingService.awardPoints()`.
- **BullMQ concurrency is 2** for code execution jobs. Prevents saturating the 2-core VPS. Never increase.
- **WebSocket namespace is `/duel`** (not root). Extension connects with JWT in `handshake.auth.token`, not headers.
- **Extension state lives in VS Code `globalState`** — Pomodoro timer, cached questions, auth flags. Only the JWT token uses `SecretStorage`.
- **Auth flow:** GitHub OAuth callback redirects to `vscode://codearena.codearena/auth?token=...`. The extension captures the deep link and stores the JWT in `SecretStorage`.
- **Judge0** is a separate Docker stack for code execution. The API's `execution` module enqueues jobs via BullMQ and dispatches to Judge0. Not part of the main `docker-compose.yml`.
- **Weekly competitions** run Thursday–Monday (`0 0 * * 4` start, `0 0 * * 1` end). Separate questions, rankings, and contributions from daily blitz.
- **Contributions** module handles user-submitted question reviews (SHADOW/ACTIVE/SUSPENDED reviewer status flow).
- **Notifications** service provides real-time in-app notifications (NestJS global module, used by duel/ranking events).
- **Docker resource limits** in `docker-compose.yml` are mandatory — 4GB / 2-core VPS. Removing limits causes OOM kills.

## Local Dev Quickstart

1. `docker compose -f docker-compose.yml -f docker-compose.local.yml up -d` (Postgres + Redis)
2. Set up a GitHub OAuth App (callback: `http://localhost:3000/auth/github/callback`), fill `.env.local`
3. `npm run dev:api` / `npm run dev:web`
4. Extension: open `apps/extension/` in VS Code, F5 launch

`start-local.ps1` (Windows) runs steps 1–3 automatically.

API Swagger docs at `http://localhost:3000/docs`.

## Reference Docs

- `CONTRIBUTING.md` — question schema, coding challenge workflow, PR checklist
- `RULES.md` — exhaustive pre-deployment checklist (286 rules). Glance at relevant sections before touching auth, duels, ranking, or competitions.

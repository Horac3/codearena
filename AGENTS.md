# AGENTS.md

Guidance for agents working in the CodeArena monorepo.

## Build & Test

```
npm run dev:api          → nest start --watch (port 3000)
npm run dev:web          → vite (port 5173)
npm run build:api        → nest build → dist/
npm run build:extension  → esbuild (not tsc), bundles to dist/extension.js
npm run lint             → eslint --ext .ts in each workspace
npm run test             → jest in each workspace
```

**Single test file:** `cd apps/api && npx jest path/to/file.test.ts`

**Validate question schemas:**
```
npx ts-node --project packages/question-schema/tsconfig.json packages/question-schema/src/validate-cli.ts questions/
```
Or use `check-duplicates.js` in `.github/scripts/` for duplicate ID detection.

**Type-check per workspace** (CI uses `tsc --noEmit`, not the build command):
```
cd apps/api       && npx tsc --noEmit
cd apps/extension && npx tsc --noEmit
```

**Build order matters:** `packages/question-schema` must be compiled (`tsc`) before API type-checking, because API's tsconfig has a path alias (`@codearena/question-schema`) pointing to its source.

## Repo Structure

| Path | Role |
|---|---|
| `apps/api/` | NestJS REST + WebSocket (`/duel` namespace) backend |
| `apps/extension/` | VS Code extension, esbuild-bundled, entry at `src/extension.ts` |
| `apps/web/` | Static Vite landing page + invite handler |
| `packages/question-schema/` | Shared Question types, XP constants, CLI validator |
| `questions/` | Community question bank (JSON), read-only in Docker |
| `.github/workflows/ci.yml` | Source of truth for validation pipeline |

## Critical Patterns

- **Questions dir is mounted `:ro`** in Docker. API loads all JSON into memory on startup via `QuestionsService.onModuleInit()`. Never write to it at runtime.
- **All rank point changes MUST flow through `RankingService.awardPoints()`** (`apps/api/src/ranking/ranking.service.ts:32`). Direct updates to `user.rankPoints` bypass floor protection, audit logging (`RankEvent`), and tier recalculation.
- **Duel scoring is server-side only.** The answer key is stripped via `DuelService.stripAnswer()` before sending questions. Client `elapsedMs` is display-only — actual timing uses server receipt timestamp.
- **Coding test files** receive the user's function as the global `solution` variable. Never `import`/`require` the solution — the execution harness injects it. See `questions/coding/tests/coding-arrays-001.test.js:2`.
- **Prisma migrations run automatically** in `entrypoint.sh` on container start (`prisma migrate deploy`). Never run migrations manually in production.
- **Redis cache keys** follow `resource:identifier` pattern with explicit TTLs. Daily sets: `daily:YYYY-MM-DD` (25h), duel rooms: `duel:roomId` (2h), leaderboard: `leaderboard:weekly` (5min).
- **Question IDs must be globally unique** across all topics. Format: `{topic}-{subtopic}-{NNN}` (e.g., `dsa-arrays-001`). CI validates via `check-duplicates.js`.
- **Daily set is seeded deterministically** via `seedrandom(date)` — same date = same questions worldwide. Never use random selection.
- **Floor protection** prevents rank drops below tier minimum until 10 duels completed at current tier. Enforced in `RankingService.awardPoints()` — do not bypass.
- **BullMQ concurrency is 2** for code execution jobs. Prevents Piston from saturating the 2-core VPS. Never increase without resource analysis.
- **WebSocket namespace is `/duel`** (not root). Extension connects with JWT in the `auth` handshake property, not headers.
- **Extension state lives in VS Code `globalState`** — Pomodoro timer, cached questions, auth flags. Only the JWT token uses `SecretStorage`.
- **Docker resource limits in `docker-compose.yml` are mandatory.** VPS has 4GB RAM / 2 cores. Removing limits will cause OOM kills (exit code 137).
- **No Prettier config** — only ESLint for formatting.

## Local Dev Quickstart

1. `docker compose -f docker-compose.yml -f docker-compose.local.yml up -d` (starts Postgres + Redis)
2. Set up a GitHub OAuth App (callback: `http://localhost:3000/auth/github/callback`), fill `.env.local`
3. `npm run dev:api` / `npm run dev:web`
4. Extension: open `apps/extension/` in VS Code, F5 launch

API Swagger docs at `http://localhost:3000/docs`.

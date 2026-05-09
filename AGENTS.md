# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Build & Test Commands

**Monorepo structure** — use workspace-specific commands:
- `npm run dev:api` — starts NestJS API with hot reload
- `npm run dev:web` — starts Vite dev server for landing page
- `npm run build:api` — compiles NestJS to dist/
- `npm run build:extension` — bundles VS Code extension with esbuild
- `npm run lint` — runs ESLint across all workspaces
- `npm run test` — runs tests across all workspaces

**Single test file** (from workspace root):
- API: `cd apps/api && npm test -- path/to/file.test.ts`
- Extension: No test suite currently exists

**Question validation**:
- `npm run validate:questions` — validates all question JSON schemas (run from root)

## Critical Non-Obvious Patterns

**Questions directory is mounted read-only** in production Docker container at `/app/questions`. The API loads all questions into memory on startup via [`QuestionsService.onModuleInit()`](apps/api/src/questions/questions.service.ts:28). Never attempt to write to this directory at runtime.

**All rank point changes MUST flow through [`RankingService.awardPoints()`](apps/api/src/ranking/ranking.service.ts:32)**. Direct updates to `user.rankPoints` will bypass floor protection, audit logging, and tier recalculation.

**Duel scoring is server-side only**. The answer key is stripped via [`stripAnswer()`](apps/api/src/duel/duel.service.ts) before sending questions to clients. Client-submitted `elapsedMs` is for display only — actual timing uses server receipt timestamp.

**Test files for coding challenges** receive the user's submitted function as the global `solution` variable. Never import or require the solution — the execution harness injects it. See [`coding-arrays-001.test.js`](questions/coding/tests/coding-arrays-001.test.js:2) for the pattern.

**Redis cache keys follow `resource:identifier` pattern** with explicit TTLs. Daily sets use `daily:YYYY-MM-DD` (25h TTL), duel rooms use `duel:roomId` (2h TTL), leaderboard uses `leaderboard:weekly` (5min TTL).

**Prisma migrations are run automatically** via [`entrypoint.sh`](apps/api/entrypoint.sh) on container startup. Never run migrations manually in production — the CD pipeline handles this.

**WebSocket namespace is `/duel`** not root. Extension connects to `wss://api.codearena.dev/duel` with JWT in `auth` handshake property, not headers.

**BullMQ concurrency is 2** for code execution jobs. This prevents Piston from saturating CPU. Never increase without VPS resource analysis.

**Floor protection prevents rank drops** until 10 duels completed at current tier. This is enforced in [`RankingService.awardPoints()`](apps/api/src/ranking/ranking.service.ts:48) — do not bypass.

**Question IDs must be globally unique** across all topics. Use format `{topic}-{subtopic}-{NNN}` (e.g., `dsa-arrays-001`). CI validates uniqueness.

**Daily set is seeded deterministically** using date as seed in [`seedDailySet()`](apps/api/src/questions/questions.service.ts:72). Same date = same questions worldwide. Never use random selection for daily sets.

**Extension state lives in VS Code `globalState`** (encrypted key-value store), not server. Pomodoro timer, cached questions, and auth flags are all local. Only JWT token is in `SecretStorage`.

**Docker resource limits are mandatory** in [`docker-compose.yml`](docker-compose.yml:31). VPS has 4GB RAM / 2 cores. Removing limits will cause OOM kills.
# AGENTS.md

Guidance for agents working in the CodeArena monorepo.

## Commands

```
npm run dev:api              → nest start --watch (port 3000)
npm run dev:web              → vite (port 5173)
npm run build:api            → nest build → dist/
npm run build:extension      → esbuild (not tsc) → dist/extension.js
npm run lint                 → eslint --ext .ts per workspace
npm run test                 → jest per workspace
npm run validate --workspace=packages/question-schema  → validate question JSONs
```

**Single test:** `cd apps/api && npx jest path/to/file.test.ts`

**Integration tests** (Postgres port 5433, Redis port 6380):
```
docker compose -f docker-compose.test.yml up -d
cd apps/api && npm run test:e2e
```

**Extension type-check:** `cd apps/extension && npx tsc --noEmit`
**Extension hot-reload:** `cd apps/extension && npm run watch`

**Build order:** `packages/question-schema` must be compiled (`tsc`) before API type-checking — API tsconfig aliases `@codearena/question-schema` to its source.

**Prisma:** Schema at `apps/api/prisma/schema.prisma`. After changes, `cd apps/api && npx prisma generate`. Migrations auto-run on container start (`prisma migrate deploy`) — never manually in production.

## Structure

| Path | Role |
|---|---|
| `apps/api/` | NestJS REST + WebSocket (`/duel`) backend |
| `apps/extension/` | VS Code extension, esbuild-bundled, entry `src/extension.ts` |
| `apps/web/` | Vite static landing page + invite handler (no runtime deps) |
| `packages/question-schema/` | Shared Question types, XP constants, CLI validator |
| `questions/` | Community question bank (JSON), mounted `:ro` in Docker |

## Conventions

- No Prettier — use ESLint formatting, keep edits consistent with existing style.
- `.env` = production, `.env.local` = local dev (see `.env.local.example` for template). Never commit either.
- Root `npm install` is sufficient. Run workspace commands from the correct package folder when needed.
- For production-sensitive changes consult `RULES.md` (auth, duels, ranking, competitions).
- For question content changes follow `CONTRIBUTING.md`.

## Critical Patterns

- **Questions dir is `:ro` in Docker.** Loaded into memory at startup via `QuestionsService.onModuleInit()`. Never write at runtime.
- **All rank point changes MUST flow through `RankingService.awardPoints()`** — no direct `prisma.user.update({ rankPoints })`. Enforces floor protection, audit logging (`RankEvent`), and tier recalculation.
- **Duel scoring is server-side only.** Answer key stripped via `DuelService.stripAnswer()` before sending questions. Client `elapsedMs` is display-only.
- **Coding tests** inject the user's function as the global `solution` variable — never `import`/`require` it. Reference solutions live in `questions/coding/solutions/` (gitignored, never committed).
- **BullMQ concurrency is 2** for code execution jobs. Never increase (2-core VPS).
- **WebSocket namespace is `/duel`** (not root). Extension connects with JWT in `handshake.auth.token`, not headers.
- **Daily set** seeded deterministically via `seedrandom(date string)` — same date = same questions worldwide.
- **Question IDs** follow `{topic}-{subtopic}-{NNN}` and must be globally unique. CI enforces via `check-duplicates.js`.
- **Floor protection** prevents rank drops below tier minimum until 10 duels completed at current tier. Enforced in `awardPoints()`.
- **Extension state** lives in VS Code `globalState` (Pomodoro, cached questions, auth flags). Only the JWT uses `SecretStorage`.
- **Auth flow:** GitHub OAuth callback → `vscode://codearena.codearena/auth?token=...` → extension captures deep link → JWT stored in `SecretStorage`.
- **Judge0** is a separate Docker stack (not in main `docker-compose.yml`). The API enqueues execution jobs via BullMQ and dispatches to Judge0.
- **Weekly competitions** run Thursday–Monday, with separate questions and rankings from daily blitz.
- **Docker resource limits** in compose files are mandatory (4GB / 2-core VPS). Removing limits causes OOM kills.

## Local Dev Quickstart

1. `docker compose -f docker-compose.yml -f docker-compose.local.yml up -d` (Postgres + Redis)
2. Set up GitHub OAuth App (callback: `http://localhost:3000/auth/github/callback`), fill `.env.local`
3. `npm run dev:api` / `npm run dev:web`
4. Extension: open `apps/extension/` in VS Code, F5 launch

`start-local.sh` / `start-local.ps1` automate steps 1–3.

API Swagger docs at `http://localhost:3000/docs`.

## CD Pipeline

`.github/workflows/cd.yml` builds and deploys on push to `main`:
1. Builds `codearena-api` and `codearena-web` Docker images (no source on server)
2. Pushes to `ghcr.io/<owner>/codearena-{api,web}:latest` (+ commit SHA tag)
3. SSHes into VPS, pulls images, runs `docker compose up -d`

**Prerequisites** — set these GitHub Actions secrets:
- `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY` — SSH access
- `VPS_PATH` — deploy directory (default `/opt/codearena`)

**Local dev** still uses `docker compose build` from source — `build:` sections in compose coexists with `image:` tags. For production, the VPS never builds; it only pulls.

## Reference Docs

- `CONTRIBUTING.md` — question schema, coding challenge workflow, PR checklist
- `RULES.md` — pre-deployment checklist (296 lines). Consult before touching auth, duels, ranking, or competitions.

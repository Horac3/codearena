# CLAUDE.md — CodeArena

Loaded every session, so every line costs tokens on every turn. Keep this under ~120 lines.
Generic rules live in `.claude/rules/kit/` (loaded automatically; TS/Docker rules load only when
matching files are touched). Do not repeat them here. `AGENTS.md` holds the full command list and
critical patterns; read it before changing auth, duels, ranking or competitions (with `RULES.md`).

Read on demand, only the parts the task needs:
- `docs/progress.md`: roadmap, current step, handoff notes. The session's source of truth.
- `docs/requirements.md`: functional requirements with IDs. Grep by ID; do not read it whole.
- `docs/decisions.md`: decision log. Check before contradicting an earlier choice.
- `docs/ARCHITECTURE.md`: codebase map. Read before exploring.

## Product
A VS Code extension that keeps developers sharp: a 5-question Daily Blitz, real-time 1v1 duels,
a weekly competition, coding challenges run on Judge0, and rank tiers. Questions are community-contributed JSON.

## Stack
- npm workspaces: `apps/api` (NestJS 10, Prisma/Postgres, Redis, BullMQ, Socket.IO `/duel`), `apps/extension`
  (VS Code, esbuild, webview script in `media/arena.js`), `apps/web` (static Vite page), `packages/question-schema`.
- Judge0 runs as a separate stack; one VPS with docker-compose behind nginx-proxy.

## Commands
All checks go through `.claude/kit/check.sh` (configured in `.claude/kit/commands.env`), ideally via the
`test-runner` subagent: `all` · `typecheck` · `lint` · `test` · `test-one "<pattern>"`.
- Build the schema package before API type-checks: `npx tsc -p packages/question-schema`.
- After schema changes: `cd apps/api && npx prisma generate`; new migrations go in `apps/api/prisma/migrations/`.
- E2E (Postgres :5433, Redis :6380): `docker compose -f docker-compose.test.yml up -d && cd apps/api && npm run test:e2e`.
- Validate questions: `npx ts-node packages/question-schema/src/validate-cli.ts questions/`.

## Architecture rules (non-negotiable)
1. All rank point changes go through `RankingService.awardPoints()` with a stable `sourceId` (D-002).
2. Scoring is server-side only. Questions leave the API through `QuestionsService.stripAnswer()`.
3. The extension webview has a nonce CSP: no inline handlers or `style=` attributes; use `data-action`.
4. Duel flow is server-driven (timer, advance, finalize) and single-instance (D-003).
5. Coding runs only through `jobs/code-harness.ts` (D-004).
6. Crons take a Redis lock (`RedisService.acquireLock`) and must be safe to re-run.

## Commit scopes
`api`, `extension`, `web`, `schema`, `questions`, `ci`, `infra`, `docs`, `kit`.

## Workflow
- Start every conversation with `/next`. One roadmap step per conversation; `/clear` between steps.
- Plan in plan mode (Opus via `opusplan`), build on Sonnet, delegate checks to `test-runner`, review with `/review`.
- Hand off with `/handoff` before context reaches ~60%.

## Compact instructions
When compacting, keep: the current step and its requirement IDs, test status (pass/fail and failing
test names), files changed, decisions made, and the exact next action. Drop: full test logs, file
contents already written to disk, exploration that did not lead anywhere.

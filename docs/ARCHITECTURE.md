# CodeArena — Architecture & Developer Reference

> Read this before making any structural changes. It explains every decision,
> every tradeoff, and exactly what each piece of code is responsible for.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Directory Structure](#2-directory-structure)
3. [VPS Resource Budget](#3-vps-resource-budget)
4. [Caching Strategy](#4-caching-strategy)
5. [Ranking System](#5-ranking-system)
6. [Daily Blitz Flow](#6-daily-blitz-flow)
7. [Duel Mode Flow](#7-duel-mode-flow)
8. [Weekly Competition Flow](#8-weekly-competition-flow)
9. [Code Execution Pipeline](#9-code-execution-pipeline)
10. [Contribution & Review System](#10-contribution--review-system)
11. [Pomodoro Integration](#11-pomodoro-integration)
12. [CI/CD Pipeline](#12-cicd-pipeline)
13. [Adding a New Feature](#13-adding-a-new-feature)
14. [Common Failure Modes](#14-common-failure-modes)

---

## 1. System Overview

CodeArena has three deployed components and one shared package:

```
┌────────────────────────────────────────────────────────────────┐
│                    VPS  (4GB RAM / 2 Cores)                    │
│                                                                │
│  nginx-proxy ──┬── api.codearena.never9to5ive.com ──► codearena-api :3000  │
│  + acme        └── codearena.never9to5ive.com      ──► codearena-web :80   │
│                                                                │
│  codearena-internal network (not internet-facing):            │
│    codearena-db      PostgreSQL  :5432                        │
│    codearena-redis   Redis       :6379                        │
│    codearena-piston  Piston      :2000                        │
└────────────────────────────────────────────────────────────────┘

VS Code Extension (runs on developer's machine)
  ├── HTTP  ──► api.codearena.never9to5ive.com  (REST — questions, auth, leaderboard)
  └── WSS   ──► api.codearena.never9to5ive.com  (WebSocket — duel real-time events)
```

**Traffic flow for a typical request:**

```
Developer's VS Code
  → HTTPS request to api.codearena.never9to5ive.com
  → nginx-proxy terminates TLS, forwards to codearena-api:3000
  → NestJS controller handles request
  → Redis cache checked first
  → If miss: Postgres queried, result cached
  → Response returned
```

**Why this topology?**

The nginx-proxy pattern was already in use for PayLink and BillFlow.
CodeArena slots into the same external network — no new proxy infra needed.
All internal services communicate over the `codearena-internal` bridge network,
which is never exposed to the internet.

---

## 2. Directory Structure

```
codearena/
│
├── apps/
│   ├── api/                     NestJS backend
│   │   ├── prisma/
│   │   │   └── schema.prisma    Single source of truth for DB schema
│   │   ├── src/
│   │   │   ├── app.module.ts    Root module — imports everything
│   │   │   ├── main.ts          Bootstrap — Swagger, CORS, validation pipe
│   │   │   │
│   │   │   ├── auth/            GitHub OAuth + JWT
│   │   │   │   ├── auth.controller.ts   /auth/github + /auth/github/callback
│   │   │   │   ├── auth.service.ts      validateGithubUser, signToken
│   │   │   │   ├── auth.module.ts
│   │   │   │   ├── github.strategy.ts   Passport GitHub OAuth strategy
│   │   │   │   ├── jwt.strategy.ts      Passport JWT strategy
│   │   │   │   ├── jwt-auth.guard.ts    HTTP route guard
│   │   │   │   └── ws-jwt.guard.ts      WebSocket guard (reads from handshake.auth)
│   │   │   │
│   │   │   ├── users/           User CRUD, XP, streak tracking
│   │   │   │   ├── users.service.ts     findByGithubId, create, updateStreak, addXp
│   │   │   │   ├── users.controller.ts  GET /users/me
│   │   │   │   └── users.module.ts
│   │   │   │
│   │   │   ├── questions/       Question bank loader + daily set seeder
│   │   │   │   ├── questions.service.ts
│   │   │   │   │   onModuleInit()       reads all JSON files from /questions vol
│   │   │   │   │   getDailySet()        Redis-cached, seeded shuffle by date
│   │   │   │   │   findById()           O(1) lookup from in-memory bank
│   │   │   │   │   findForDuel()        random subset, no coding questions
│   │   │   │   │   findForWeeklyComp()  difficulty 2-3 only
│   │   │   │   │   seedDailySet()       @Cron — midnight UTC
│   │   │   │   ├── questions.controller.ts  GET /questions/daily, GET /questions/:id
│   │   │   │   └── questions.module.ts
│   │   │   │
│   │   │   ├── ranking/         All rank point logic — single source of truth
│   │   │   │   ├── ranking.constants.ts
│   │   │   │   │   RANK_TIERS[]          10 tiers with point thresholds
│   │   │   │   │   DAILY_POINTS          XP values for daily blitz
│   │   │   │   │   DUEL_POINTS           Point deltas per outcome + tier delta
│   │   │   │   │   WEEKLY_COMP_POINTS    Competition finish bonuses
│   │   │   │   │   CONTRIBUTION_POINTS   Authorship + review rewards
│   │   │   │   │   calculateDuelPoints() asymmetric by rank tier delta
│   │   │   │   │   calculateStreakMultiplier() capped at 2×
│   │   │   │   ├── ranking.service.ts
│   │   │   │   │   awardPoints()         ALL rank changes flow through here
│   │   │   │   │   awardDuelPoints()     handles both players + floor protection
│   │   │   │   │   checkStreakBadges()   awards streak milestone badges
│   │   │   │   │   getUserRankInfo()     progress to next tier as percentage
│   │   │   │   └── ranking.module.ts
│   │   │   │
│   │   │   ├── duel/            Real-time WebSocket duel engine
│   │   │   │   ├── duel.gateway.ts
│   │   │   │   │   CREATE_DUEL   → creates room, returns invite token + links
│   │   │   │   │   JOIN_DUEL     → validates room, triggers COUNTDOWN + QUESTION push
│   │   │   │   │   ANSWER        → server-side scoring, broadcasts SCORE_UPDATE
│   │   │   │   │   QUESTION_TIMEOUT → records unanswered question as wrong
│   │   │   │   │   disconnect    → marks duel ABANDONED, notifies opponent
│   │   │   │   ├── duel.service.ts
│   │   │   │   │   Room state lives in Redis (not memory) for crash safety
│   │   │   │   │   stripAnswer() never sends correct answer to clients
│   │   │   │   │   finalizeDuel() awards XP, updates DB, cleans Redis room
│   │   │   │   ├── duel.controller.ts   GET /duels/invite/:token (web invite page)
│   │   │   │   └── duel.module.ts
│   │   │   │
│   │   │   ├── leaderboard/     Weekly XP rankings
│   │   │   │   ├── leaderboard.service.ts   Redis-cached 5min, Monday reset
│   │   │   │   ├── leaderboard.controller.ts GET /leaderboard/weekly
│   │   │   │   └── leaderboard.module.ts
│   │   │   │
│   │   │   ├── weekly/          Weekly competition (Thu–Sun)
│   │   │   │   ├── weekly.service.ts
│   │   │   │   │   openWeeklyCompetition()   @Cron Thursday midnight
│   │   │   │   │   closeWeeklyCompetition()  @Cron Monday midnight + awards
│   │   │   │   │   submitWeeklyAnswers()      one submission per user per week
│   │   │   │   │   getActiveCompetition()     Redis-cached
│   │   │   │   ├── weekly.controller.ts   GET /weekly/active, POST /weekly/submit
│   │   │   │   └── weekly.module.ts
│   │   │   │
│   │   │   ├── contributions/   Question PR review pipeline
│   │   │   │   ├── contributions.service.ts
│   │   │   │   │   registerContribution()     called by CI webhook on PR open
│   │   │   │   │   markCiPassed()             moves to NEEDS_REVIEW
│   │   │   │   │   submitReview()             validates reviewer rank, checklist
│   │   │   │   │   submitShadowReview()        for reviewer candidates
│   │   │   │   │   verifyShadowReview()        maintainer validates shadow
│   │   │   │   │   mergeContribution()         awards author points + badges
│   │   │   │   │   notifyQuestionUsed()        awards author bonus on use
│   │   │   │   ├── contributions.controller.ts
│   │   │   │   └── contributions.module.ts
│   │   │   │
│   │   │   ├── execution/       Piston HTTP client (sync, for direct calls)
│   │   │   │   ├── execution.service.ts   builds runnable, calls Piston, parses output
│   │   │   │   ├── execution.controller.ts POST /execute
│   │   │   │   └── execution.module.ts
│   │   │   │
│   │   │   ├── jobs/            BullMQ queue (async, rate-limited execution)
│   │   │   │   ├── execution.queue.ts
│   │   │   │   │   concurrency: 2  (max 2 Piston calls simultaneously)
│   │   │   │   │   enqueue()       returns jobId immediately
│   │   │   │   │   processJob()    calls Piston, awards XP on completion
│   │   │   │   └── jobs.module.ts
│   │   │   │
│   │   │   ├── notifications/   Pub/sub notifications (Redis + Postgres)
│   │   │   │   ├── notifications.service.ts  send(), getUnread(), markRead()
│   │   │   │   └── notifications.module.ts  @Global() — available everywhere
│   │   │   │
│   │   │   ├── prisma/          Prisma client wrapper
│   │   │   │   ├── prisma.service.ts    extends PrismaClient, onModuleInit connect
│   │   │   │   └── prisma.module.ts     @Global()
│   │   │   │
│   │   │   └── redis/           ioredis wrapper
│   │   │       ├── redis.service.ts     get/set/del/getJson/setJson helpers
│   │   │       └── redis.module.ts      @Global()
│   │   │
│   │   ├── Dockerfile           Production — compiled dist, runs migrations
│   │   ├── Dockerfile.local     Development — ts-node-dev hot reload
│   │   └── entrypoint.sh        prisma migrate deploy → node dist/main.js
│   │
│   ├── extension/               VS Code extension (TypeScript + esbuild)
│   │   └── src/
│   │       ├── extension.ts     Activation, URI handler, command registration
│   │       ├── panels/
│   │       │   ├── arena.panel.ts        WebviewPanel host — all game UI
│   │       │   └── webview-content.ts    HTML/CSS/JS injected into webview
│   │       ├── services/
│   │       │   ├── auth.service.ts       JWT in SecretStorage (encrypted)
│   │       │   ├── api.service.ts        HTTP client + 24h question cache
│   │       │   ├── duel.service.ts       Socket.io client, event bus
│   │       │   └── pomodoro.service.ts   Timer in globalState, zero server calls
│   │       ├── providers/
│   │       │   ├── menu.provider.ts      Sidebar tree — nav items
│   │       │   └── leaderboard.provider.ts  Sidebar tree — top 10 ranks
│   │       └── utils/
│   │           └── status-bar.ts         Streak + level chip, right status bar
│   │
│   └── web/                     Static landing page + invite handler
│       ├── index.html           SPA — /duel/:token invite page, /auth/success
│       ├── nginx.conf           Serves static files, SPA fallback
│       ├── Dockerfile           nginx:alpine
│       └── Dockerfile.local     Vite dev server
│
├── packages/
│   └── question-schema/         Shared TypeScript types (used by API + CI)
│       └── src/
│           ├── index.ts         Question, MCQQuestion, CodingQuestion types
│           │                    XP constants, calculateXp helpers
│           └── validate-cli.ts  CLI schema validator — run in CI
│
├── questions/                   Community question bank (JSON files)
│   ├── dsa/questions.json
│   ├── systems/questions.json
│   ├── cs-fundamentals/questions.json
│   ├── networking/questions.json
│   └── coding/
│       ├── coding-arrays-001.json    Question definition
│       ├── tests/                    Test suites (public)
│       └── solutions/                Reference solutions (.gitignore'd)
│
├── nginx/
│   └── codearena.conf           WebSocket Upgrade header config for nginx-proxy
│
├── .github/
│   ├── workflows/
│   │   ├── ci.yml               PR validation: schema, solutions, builds
│   │   ├── cd.yml               Auto-deploy to VPS on merge to main
│   │   └── weekly-competition.yml  Monday announcement trigger
│   └── scripts/
│       ├── test-solutions.js    Runs reference solutions against test suites
│       └── check-duplicates.js  Finds duplicate question IDs
│
├── docs/
│   ├── ARCHITECTURE.md          This file
│   ├── USER_GUIDE.md            End-user documentation
│   ├── CONTRIBUTOR_GUIDE.md     Question + code contribution guide
│   └── deployment.md            VPS setup and operations guide
│
├── docker-compose.yml           Production deployment
├── docker-compose.local.yml     Local development override
├── .env.example                 Production environment template
└── .env.local.example           Local development environment template
```

---

## 3. VPS Resource Budget

**Hardware:** 4GB RAM, 2 cores, 40GB storage

Every container has explicit CPU and memory limits in `docker-compose.yml`.
Without limits, one container can OOM-kill everything else.

| Container | CPU limit | Memory limit | Why |
|---|---|---|---|
| codearena-api | 0.80 cores | 512MB | Node.js is I/O-bound; most time waiting on DB/Redis |
| codearena-web | 0.10 cores | 64MB | nginx serving static files — trivial load |
| codearena-db | 0.50 cores | 768MB | Postgres needs RAM for shared_buffers |
| codearena-redis | 0.20 cores | 256MB | In-memory store; configured with maxmemory |
| codearena-piston | 0.80 cores | 512MB | CPU-hungry; isolated so it can't starve API |
| OS + headroom | — | ~700MB | Kernel, ssh, monitoring |
| **Total** | **1.9 cores** | **~2.8GB** | Leaves 1.2GB and 0.1 cores spare |

**The BullMQ queue concurrency is set to 2.** This means at most 2 code executions
run simultaneously in Piston. Each execution takes ~200–800ms and briefly spikes
the CPU. With concurrency 2, Piston uses at most 1.6 cores (2 × 0.8), leaving
the API its full 0.8 cores throughout.

**Postgres tuning flags** (in docker-compose.yml):

```
max_connections=50        (default 100 — we only need ~10 from the API)
shared_buffers=256MB      (25% of Postgres memory allocation)
work_mem=4MB              (per-query sort memory — conservative)
```

---

## 4. Caching Strategy

All cache keys follow the pattern `resource:identifier` with explicit TTLs.

| Key | TTL | What it stores |
|---|---|---|
| `daily:YYYY-MM-DD` | 25 hours | Today's 5-question blitz set (array of Question) |
| `leaderboard:weekly` | 5 minutes | Top 50 users by weeklyXp |
| `weekly:active` | 4 days | Active WeeklyCompetition record |
| `duel:roomId` | 2 hours | DuelRoom state (players, questions, scores, index) |
| `exec:result:jobId` | 1 hour | ExecutionResult for completed coding jobs |
| `notifications:userId` | pub/sub | Real-time notification channel |

**Cache invalidation rules:**

- `leaderboard:weekly` is deleted whenever a user's `weeklyXp` changes
- `weekly:active` is deleted when the competition closes
- `duel:roomId` is deleted when the duel finalises or is abandoned
- `daily:YYYY-MM-DD` is never invalidated — the date is the natural expiry

**Extension-side cache (VS Code globalState):**

| Key | TTL | What |
|---|---|---|
| `daily:YYYY-MM-DD` | 24 hours | Same daily set, avoids refetch |
| `codearena.pomodoro.state` | Persistent | Current timer state (phase, seconds, cycles) |
| `codearena.pomodoro.settings` | Persistent | User's Pomodoro preferences |
| `codearena.authed` | Persistent | Boolean auth state flag |

---

## 5. Ranking System

### The Rank Ladder

10 tiers. Progress is strictly additive — points only go down from duel losses,
never from daily blitz, weekly competition, or coding challenges.

| Tier | Title | Min points | Approx time (active player) |
|---|---|---|---|
| 1 | Script Kiddie | 0 | Day 1 |
| 2 | Code Monkey | 300 | Week 1 |
| 3 | Bug Hunter | 900 | Week 2–3 |
| 4 | Stack Overflow Refugee | 2,000 | Week 4–5 |
| 5 | Algorithm Apprentice | 4,500 | Week 6–8 |
| 6 | Architecture Architect | 8,500 | Week 9–12 |
| 7 | System Sage | 14,000 | Week 13–15 |
| 8 | Kernel Wizard | 22,000 | Week 16–17 |
| 9 | Distributed Deity | 32,000 | Week 18–19 |
| 10 | Ultimate Geek | 45,000 | Week 20 |

### How Points Are Earned

**Daily Blitz:**
```
Base per correct answer:    50 pts
Speed bonus (0–60s):        0–30 pts (linear decay)
Perfect score (5/5):       +100 pts
Completion (any score):    +25 pts
Streak multiplier:          ×1.0 to ×2.0 (10+ days)
```

**Example — 10-day streak, 5/5 correct, average 8 seconds:**
```
(5 × 50) + (5 × 28 speed) + 100 + 25 = 515 × 2.0 = 1,030 pts
```

**Duels (asymmetric by rank tier delta):**
```
Win vs higher rank:    +80 + (20 × tier difference), capped at +140
Win vs same rank:      +50
Win vs lower rank:     +25
Draw:                  +20 each
Loss vs higher rank:   −5
Loss vs same rank:     −15
Loss vs lower rank:    −30
```

**Floor protection:** Until you have completed 10 duels at your current tier,
you cannot lose enough points to drop below the tier's minimum threshold.
This prevents new arrivals at a tier from immediately falling back.

**Weekly Competition:**
```
Rank 1:        +1,000 pts + WEEKLY_CHAMPION badge
Rank 2:        +600 pts
Rank 3:        +400 pts
Top 10:        +200 pts
Top 25:        +100 pts
Participation: +50 pts
```

**Weekly Leaderboard (awarded Monday on reset):**
```
#1: +500 pts  |  #2: +300 pts  |  #3: +150 pts  |  Top 10: +50 pts
```

**Coding Challenges:**
```
Per passing test case: +25 pts
(awarded on submission, not per solve — you can re-submit)
```

**Contribution & Review:**
```
Question merged:             +200 pts + QUESTION_AUTHOR badge
Question used in blitz:      +100 pts
Question used in weekly comp:+300 pts
Review submitted:            +10 pts
Review leads to merge:       +50 pts
```

### All Rank Changes Are Audited

Every call to `RankingService.awardPoints()` writes a `RankEvent` record:
```
{ userId, delta, reason, sourceId, rankBefore, rankAfter, tierBefore, tierAfter }
```

This means you can audit any user's full point history and debug unexpected
rank changes by querying `RankEvent` where `userId = X` order by `createdAt`.

---

## 6. Daily Blitz Flow

```
midnight UTC: QuestionsService.seedDailySet() (cron)
  → deterministic shuffle with seed = "YYYY-MM-DD"
  → same 5 questions for every user worldwide
  → stored in Postgres DailySet + cached in Redis daily:YYYY-MM-DD

User opens Daily Blitz in extension:
  → ApiService.getDailySet()
  → checks globalState cache (key: daily:YYYY-MM-DD)
  → if miss: GET /questions/daily → cached for 24h in globalState
  → WebviewPanel renders 5 questions sequentially

User answers all 5:
  → extension sends POST /daily/submit { date, answers[] }
  → server scores server-side (answer keys never sent to client)
  → RankingService.awardPoints() called with daily_blitz reason
  → streak updated via UsersService.updateStreak()
  → DailySubmission record created (unique on userId + date)
  → weeklyXp incremented → Redis leaderboard:weekly invalidated
```

**One submission per day is enforced** by the `@@unique([userId, date])`
constraint on `DailySubmission`. A second submit for the same date returns 409.

---

## 7. Duel Mode Flow

```
Player A: POST /duels creates Duel record + invite token
  → server selects questions (no coding, random)
  → DuelRoom written to Redis duel:roomId
  → returns { roomId, inviteToken, inviteLink, vsCodeLink }

Player A shares vsCodeLink (vscode://codearena.codearena/duel/TOKEN)

Player B clicks link → UriHandler in extension fires
  → DuelService.connect() establishes WebSocket to /duel namespace
  → emits JOIN_DUEL { roomId }

Server (duel.gateway.ts):
  → validates room not expired, not full, not self-duel
  → updates Duel status to ACTIVE in Postgres
  → emits DUEL_READY to both players
  → 3s countdown then emits QUESTION to both in same event-loop tick

Both players answer:
  → ANSWER { roomId, questionId, choice, elapsedMs }
  → server timestamps receipt (client elapsedMs is display only)
  → scores server-side: 'answer' in question && question.answer === choice
  → emits SCORE_UPDATE to room

When both answer (or timer expires):
  → 1.5s pause to show result
  → next QUESTION pushed, OR DUEL_END if all rounds done

DUEL_END:
  → RankingService.awardDuelPoints() — asymmetric by tier delta
  → floor protection applied if < 10 duels at current tier
  → XP written to both users
  → Redis room deleted
  → Postgres Duel updated: status COMPLETED, scores, winnerId
```

**Scoring is always server-side.** The client sends `choice` (0–3). The server
looks up the question from its in-memory bank and checks `question.answer === choice`.
The answer is never sent to the client — `stripAnswer()` removes it before push.

---

## 8. Weekly Competition Flow

```
Thursday 00:00 UTC: WeeklyService.openWeeklyCompetition() (cron)
  → picks theme by rotating through THEMES array by week number
  → selects 10 questions (difficulty 2-3 only, no coding)
  → creates WeeklyCompetition record, sets isActive = true
  → caches in Redis weekly:active

Thursday–Sunday: competition is open
  → GET /weekly/active returns competition + questions (answers stripped)
  → POST /weekly/submit scores and records WeeklySubmission
  → one submission per user enforced by @@unique([userId, competitionId])

Monday 00:00 UTC: WeeklyService.closeWeeklyCompetition() (cron)
  → ranks all submissions by score DESC, submittedAt ASC (tie-break)
  → awards rank points per finish position
  → awards WEEKLY_CHAMPION / WEEKLY_PODIUM / WEEKLY_TOP_10 badges
  → resets all users weeklyXp to 0
  → awards weekly leaderboard bonuses before reset
  → sets isActive = false, deletes Redis weekly:active
```

---

## 9. Code Execution Pipeline

Judge0 runs as a separate Docker Compose stack on the VPS. The execution flow:

```
POST /execute { questionId, language, code }
  → ExecutionController validates request
  → Creates ExecutionJob record in Postgres (status: queued)
  → ExecutionQueue.enqueue() → BullMQ queue
  → Returns { jobId } immediately (202 Accepted)

Extension polls GET /execute/:jobId every 2 seconds

BullMQ worker (concurrency: 2):
  → ExecutionQueue.processJob()
  → Loads test file from /app/questions/coding/tests/
  → Builds runnable: user code + inline harness + test source
  → POSTs to Judge0 /submissions?wait=true with:
      - source_code: full runnable code
      - language_id: Judge0 language ID (93=JS, 94=TS, 71=Python, 95=Go)
      - cpu_time_limit: time limit in seconds
      - memory_limit: 128MB in KB
  → Judge0 returns synchronously (wait=true mode)
  → Parses stdout for JSON results array
  → Checks status.id: 3 = Accepted (passed), else failed
  → Updates ExecutionJob (status: completed, result: {...})
  → Awards XP via RankingService
  → Caches result in Redis exec:result:jobId (1 hour)

Extension GET /execute/:jobId returns result
  → WebviewPanel renders pass/fail per test case
```

**Why async / queue-based?**

A single Judge0 execution takes 200–800ms and spikes the CPU.
Without a queue, 10 simultaneous submissions would saturate both cores
and make the API unresponsive for all other users.
With concurrency=2, the queue ensures a smooth, predictable load profile.

**Judge0 Language IDs:**
- JavaScript (Node.js 18): 93
- TypeScript: 94
- Python 3: 71
- Go: 95

---

## 10. Contribution & Review System

### Contribution States

```
DRAFT → NEEDS_REVIEW → IN_REVIEW → APPROVED → MERGED
                             └─────────────→ CHANGES_REQUESTED
                                       └──────────────→ REJECTED
```

### Reviewer Qualification

1. Developer must be rank tier 5+ (Algorithm Apprentice)
2. Developer submits 3 shadow reviews (hidden from contributor)
3. Maintainer compares shadow review verdicts to their own
4. If accuracy ≥ 90% → promoted to ACTIVE reviewer
5. Rank tier 8+ → senior reviewer (can merge without maintainer)

### Review Checklist (6 items, all required)

```json
{
  "stemClear": true,
  "correctAnswer": true,
  "distractors": true,
  "explanation": true,
  "testCoverage": true,
  "difficultyAccurate": true
}
```

A review submitted without all 6 keys is rejected with 400.

### Auto-assignment

When CI passes and a contribution moves to NEEDS_REVIEW, the service
queries for active reviewers ordered by `rankPoints DESC` and assigns
the top 3. They receive an in-app notification.

---

## 11. Pomodoro Integration

The Pomodoro timer lives **entirely in the VS Code extension**.
Zero server calls. Zero DB writes. Zero Redis entries.

All state is stored in `context.globalState` (VS Code's encrypted key-value store).
When VS Code is closed, the timer pauses. When reopened, it resumes from saved state.

Settings are also stored in `globalState` — changing them never hits the API.
This is intentional: Pomodoro preferences are personal and local.

When a work session ends and `autoPromptBlitz = true`, the extension shows
an `InformationMessage` with an "Open Daily Blitz" button. If clicked, it
dispatches `codearena.openDaily` — which then makes a single API call to
fetch/return the cached daily set.

The Pomodoro timer does NOT affect rank, XP, or any server-side state.

---

## 12. CI/CD Pipeline

### CI (runs on every PR and push to main/develop)

```
ci.yml:
  validate-questions   schema + duplicate ID check (parallel)
  test-solutions       reference solutions vs test suites (parallel)
  build                TypeScript type-check + esbuild bundle (parallel)
  docker-build         Docker smoke-test (main branch only)
```

### CD (runs on merge to main)

```
cd.yml:
  1. SSH into VPS
  2. git pull origin main
  3. docker compose build --no-cache api web
  4. prisma migrate deploy (zero-downtime migration)
  5. docker compose up -d --no-deps api web
  6. curl health check — fails deployment if API doesn't respond
```

**Zero-downtime strategy:** `--no-deps` restarts only the API and web containers.
Postgres and Redis keep running throughout. The new API container starts and
passes the health check before the old one is removed.

**Required GitHub Secrets:**

| Secret | Value |
|---|---|
| `VPS_HOST` | Your VPS IP or hostname |
| `VPS_USER` | SSH user (`ubuntu` or `root`) |
| `VPS_SSH_KEY` | Contents of your private SSH key |

---

## 13. Adding a New Feature

**New question type:**
1. Add the type to `packages/question-schema/src/index.ts`
2. Add validation in `validate-cli.ts`
3. Add a sample question JSON file in `questions/<topic>/`
4. Update `QuestionsService` if the type needs special handling

**New API endpoint:**
1. Create `src/feature/feature.service.ts`
2. Create `src/feature/feature.controller.ts`
3. Create `src/feature/feature.module.ts`
4. Import the module in `app.module.ts`
5. Add Swagger `@ApiOperation` decorators

**New rank event reason:**
1. Add the reason string to `RankingService.awardPoints()` call
2. Add the point value to `ranking.constants.ts`
3. No schema change needed — `reason` is a free string in `RankEvent`

**New badge type:**
1. Add to the `BadgeType` enum in `schema.prisma`
2. Run `npx prisma migrate dev --name add_badge_type`
3. Call `prisma.badge.create()` where appropriate

---

## 14. Common Failure Modes

**API returns 502 after deploy**
→ Check `docker compose logs codearena-api`
→ Usually a failed migration — check Prisma output in logs
→ Fix: `docker compose exec codearena-api npx prisma migrate deploy`

**WebSocket duels drop after ~60 seconds**
→ nginx `proxy_read_timeout` not configured
→ Fix: ensure `nginx/codearena.conf` is mounted into nginx-proxy
→ The file sets `proxy_read_timeout 86400s`

**Daily questions not refreshing**
→ Check `QuestionsService.seedDailySet()` cron fired at midnight UTC
→ Check Redis: `docker compose exec codearena-redis redis-cli get daily:YYYY-MM-DD`
→ Manual trigger: `POST /questions/seed` (maintainer auth only)

**Piston executions timing out**
→ Check `docker compose logs codearena-piston`
→ Piston language runtime not installed
→ Fix: `docker compose exec codearena-piston node -e "require('axios').post('http://localhost:2000/api/v2/packages', {language:'javascript',version:'18.15.0'})"`

**OOM kill (container exits with code 137)**
→ A container exceeded its memory limit
→ Check: `docker stats`
→ Redis: increase `maxmemory` or reduce TTLs
→ Postgres: reduce `shared_buffers`
→ API: check for memory leaks in long-running WebSocket connections

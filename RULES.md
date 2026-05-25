Here are all the rules governing CodeArena, written as pre-deployment checks you can verify before going live.

---

# CodeArena — Pre-Deployment Rules & Checks

---

## 1. Authentication Rules

- [ ] Every API endpoint except `/auth/github` and `/auth/github/callback` requires a valid JWT
- [ ] JWT secret is at least 32 characters — never a default or placeholder value
- [ ] GitHub OAuth callback URL in `.env` exactly matches the URL registered in the GitHub OAuth App — one character difference breaks auth entirely
- [ ] JWT expires after 30 days — users are not silently logged out mid-session
- [ ] WebSocket connections authenticate via `handshake.auth.token` — not cookies or query params
- [ ] The VS Code extension stores the JWT in `SecretStorage` (encrypted) — never in `globalState` or plain text
- [ ] Signing out clears the token from `SecretStorage` completely
- [ ] The auth deep link `vscode://codearena.codearena/auth?token=` only fires after GitHub successfully validates the user

---

## 2. Daily Blitz Rules

- [ ] Every day at midnight UTC a new daily set is seeded — the cron `@Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)` is registered and firing
- [ ] The seed is the date string `YYYY-MM-DD` — same seed produces identical question order for every user worldwide
- [ ] Daily set contains exactly 5 questions — never 4, never 6
- [ ] Answers are never sent to the client — `answer` field is stripped server-side before the response leaves the API
- [ ] Each user can submit once per day — enforced by `@@unique([userId, date])` on `DailySubmission`
- [ ] A second submission for the same date returns HTTP 409, not 200
- [ ] Daily set is cached in Redis with a 25-hour TTL — the extra hour prevents a midnight race condition where users in different time zones see a stale set
- [ ] Daily set is also cached in the extension's `globalState` for 24 hours — fetched once, not on every panel open
- [ ] Scoring happens server-side — the client sends `choice` (0–3), the server looks up `question.answer` from its in-memory bank
- [ ] Speed bonus decays linearly from +30 pts at 0ms to 0 pts at 60,000ms — never negative
- [ ] Perfect score bonus (+100 pts) only triggers when all 5 answers are correct
- [ ] Completion bonus (+25 pts) awards even on 0/5 — showing up counts
- [ ] Streak multiplier is capped at 2.0× — a 10-day streak and a 100-day streak both multiply by 2.0
- [ ] Missing a day resets streak to 1, not 0 — the day you return counts as day 1
- [ ] `UsersService.updateStreak()` is called on every daily submission — not just correct ones

---

## 3. Rank & Points Rules

- [ ] All rank point changes flow through `RankingService.awardPoints()` — no direct `prisma.user.update({ rankPoints })` anywhere else in the codebase
- [ ] Every rank point change writes a `RankEvent` record — delta, reason, sourceId, before/after values all recorded
- [ ] `rankTier` is always computed from `rankPoints` using `getTierForPoints()` — never manually set
- [ ] Tier thresholds are read from `RANK_TIERS` array in `ranking.constants.ts` — not hardcoded anywhere else
- [ ] Rank points can never go below 0 — `Math.max(0, pointsBefore + delta)` enforced in `awardPoints()`
- [ ] Floor protection is active: a user cannot drop below their current tier's `minPoints` until they have completed 10 duels at that tier
- [ ] `duelsAtTier` resets to 0 when a user ranks up — floor protection starts fresh at each new tier
- [ ] When a user ranks up, `duelsAtTier` is reset in the same DB transaction as the tier update
- [ ] Rank-up triggers a notification and a `RANK_UP` badge — both in the same `awardPoints()` call
- [ ] Reaching tier 10 awards `ULTIMATE_GEEK` badge instead of `RANK_UP`
- [ ] The 10-tier ladder thresholds are: 0 / 300 / 900 / 2,000 / 4,500 / 8,500 / 14,000 / 22,000 / 32,000 / 45,000

---

## 4. Duel Rules

- [ ] A user cannot duel themselves — `playerAId === playerBId` returns an error
- [ ] Duel invite tokens are cryptographically random (`randomBytes(8).toString('hex')`) — not sequential or predictable
- [ ] Invite tokens expire after 24 hours — `expiresAt` checked on `JOIN_DUEL`
- [ ] An expired invite returns an error, not a silent failure
- [ ] Duel room state lives in Redis — not in Node.js memory — so an API restart does not kill active duels
- [ ] Questions are pushed to both players in the same event-loop tick — not via two separate `setTimeout` calls
- [ ] Answers are scored server-side — the server checks `question.answer === choice` from its in-memory bank
- [ ] Client-supplied `elapsedMs` is used for display only — actual speed bonus uses server receive timestamp
- [ ] `stripAnswer()` is called before any question is pushed to clients — `answer` field never leaves the server
- [ ] When both players have answered, there is a 1,500ms pause before the next question — enough time to show the result
- [ ] When a question timer expires, `QUESTION_TIMEOUT` records the answer as wrong — no points, no error
- [ ] If a player disconnects mid-duel the duel is marked `ABANDONED` — the opponent receives `PLAYER_DISCONNECTED`
- [ ] Duel point awards are asymmetric by rank tier delta — verified against `calculateDuelPoints()` in `ranking.constants.ts`
- [ ] Win vs higher rank: +80 base + 20 per tier difference, capped at +140
- [ ] Win vs same rank: +50
- [ ] Win vs lower rank: +25
- [ ] Draw: +20 each
- [ ] Loss vs higher rank: −5
- [ ] Loss vs same rank: −15
- [ ] Loss vs lower rank: −30
- [ ] Both players' tier snapshots are recorded on the `Duel` record at creation time — not recalculated at resolution
- [ ] `finalizeDuel()` awards XP, updates DB, and deletes the Redis room atomically — a crash mid-finalize does not leave orphaned rooms
- [ ] Coding questions are excluded from duel question pools — `q.type !== 'coding'` filter is applied in `findForDuel()`
- [ ] Only 5 or 7 rounds are valid — any other value defaults to 7

---

## 5. Weekly Competition Rules

- [ ] Competition opens every Thursday at midnight UTC — `@Cron('0 0 * * 4')`
- [ ] Competition closes every Monday at midnight UTC — `@Cron('0 0 * * 1')`
- [ ] Exactly 10 questions per competition — difficulty 2 or 3 only, no coding questions
- [ ] Theme rotates by week number — `THEMES[weekNum % THEMES.length]` — deterministic, not random
- [ ] Only one active competition at a time — previous competition is deactivated before new one opens
- [ ] Each user can submit once per competition — enforced by `@@unique([userId, competitionId])`
- [ ] Answers are stripped from competition questions before sending to client — same as daily blitz
- [ ] Scoring on close: submissions ranked by `score DESC`, then `submittedAt ASC` as tie-break — earlier submission wins a tie
- [ ] Point awards on close: 1,000 / 600 / 400 / 200 / 100 / 50 (participation)
- [ ] Weekly leaderboard bonuses are awarded before the weekly XP reset — not after
- [ ] Weekly XP resets to 0 for all users on Monday — `weeklyXp` column, not `rankPoints`
- [ ] Weekly champion badge is date-stamped — `"Week of YYYY-MM-DD — Theme Champion"`
- [ ] `finalRank` on `WeeklySubmission` is null until the competition closes — never set prematurely

---

## 6. Leaderboard Rules

- [ ] Weekly leaderboard tracks `weeklyXp` — not `rankPoints` — so anyone can top it regardless of all-time rank
- [ ] Leaderboard is cached in Redis for 5 minutes — never queried on every request
- [ ] Redis key `leaderboard:weekly` is invalidated whenever any user's `weeklyXp` changes
- [ ] Weekly XP resets every Monday at midnight UTC before the leaderboard is rebuilt
- [ ] Leaderboard returns top 50 users — not unbounded
- [ ] All-time rank ladder is separate from the weekly leaderboard — rank points never reset

---

## 7. Coding Challenge & Execution Rules

- [ ] All code execution goes through the BullMQ queue — never called synchronously from a controller
- [ ] Queue concurrency is set to 2 — never higher on this VPS
- [ ] The API returns `jobId` immediately (202 Accepted) — execution result is polled, not awaited
- [ ] Execution results are cached in Redis for 1 hour after completion — duplicate polls do not re-execute
- [ ] The correct answer (`answer` field) is never sent to the client for any question type
- [ ] The test harness is injected server-side — the user never sees the test source
- [ ] Reference solutions live in `questions/coding/solutions/` which is in `.gitignore` — never committed
- [ ] User-submitted code runs in Judge0's sandbox — network access blocked, file writes blocked, process spawning blocked
- [ ] CPU time limit: 5 seconds per submission (configurable via `timeLimit` on the question)
- [ ] Memory limit: 128MB per submission
- [ ] Supported languages: `javascript`, `typescript`, `python`, `go` — any other value returns 400
- [ ] XP is awarded per passing test case (+25 pts each) — not per full solve
- [ ] Coding challenges never appear in duel question pools
- [ ] `ExecutionJob` record is created before the job is enqueued — a BullMQ crash does not lose the job record

---

## 8. Contribution & Review Rules

- [ ] A contribution cannot be merged unless CI has passed — `ciPassed: true` on the `Contribution` record
- [ ] A contribution requires approval from exactly 2 reviewers before it can be merged
- [ ] A reviewer cannot review their own contribution — `reviewerId === authorId` returns 403
- [ ] A reviewer cannot submit two reviews for the same contribution — `@@unique([contributionId, reviewerId])`
- [ ] The review checklist requires all 6 items to be present: `stemClear`, `correctAnswer`, `distractors`, `explanation`, `testCoverage`, `difficultyAccurate`
- [ ] A review submitted with missing checklist items returns 400
- [ ] Reviewer eligibility requires rank tier 5 or above (Algorithm Apprentice)
- [ ] Founding reviewers (first 3 months) require only rank tier 3
- [ ] Shadow reviews are hidden from the contributor until a maintainer verifies them
- [ ] Shadow reviewer promotion requires 3 completed shadow reviews with ≥ 90% accuracy match against maintainer verdicts
- [ ] Senior reviewer status (can merge without maintainer) requires rank tier 8 or above
- [ ] When a contribution is merged, the author receives +200 rank points and a `QUESTION_AUTHOR` badge
- [ ] The `QUESTION_AUTHOR` badge is only awarded once — `ensureBadge()` checks for duplicates before creating
- [ ] `CONTENT_CREATOR` badge triggers at 5 merged questions — checked on every merge
- [ ] `CURRICULUM_ARCHITECT` badge triggers at 20 merged questions — checked on every merge
- [ ] When a merged question appears in the daily blitz, the author receives +100 bonus rank points via `notifyQuestionUsed()`
- [ ] When a merged question appears in the weekly competition, the author receives +300 bonus rank points
- [ ] Question IDs must be unique across the entire bank — enforced by CI (`check-duplicates.js`) and by `@unique` on `Contribution.questionId`
- [ ] Reference solutions are never stored in the database — only on disk in the gitignored `solutions/` directory

---

## 9. Pomodoro Rules

- [ ] The Pomodoro timer runs entirely in the VS Code extension — zero API calls, zero server state
- [ ] Timer state persists in `context.globalState` — survives VS Code restarts
- [ ] Timer settings persist in `context.globalState` — user preferences survive updates
- [ ] Default settings: work=25min, break=5min, long break=15min, cycles before long break=4
- [ ] `autoPromptBlitz` defaults to `true` — user can disable in settings
- [ ] The Daily Blitz prompt on break is a VS Code `InformationMessage` — dismissible, never forced
- [ ] Changing Pomodoro settings never triggers an API call
- [ ] The Pomodoro timer has no effect on rank, XP, or any server-side value

---

## 10. Question Bank Rules

- [ ] The question bank is loaded into memory at API startup — `onModuleInit()` reads all JSON files from the mounted `/app/questions` volume
- [ ] Questions with parse errors are logged and skipped — they do not crash the startup
- [ ] The in-memory bank is never mutated at runtime — it is read-only after `onModuleInit()`
- [ ] New questions go live only after an API restart (or the next deploy) — no hot-reloading
- [ ] Every question must have: `id`, `type`, `topic`, `difficulty`, `stem`, `explanation`, `tags`, `author`
- [ ] MCQ, trace, and bug-hunt questions must have exactly 4 options and an `answer` of 0–3
- [ ] Trace and bug-hunt questions must include `code` and `language`
- [ ] Coding questions must include `functionSignature`, `examples`, `constraints`, and `testFile`
- [ ] Difficulty must be 1, 2, or 3 — no other values
- [ ] Topic must be one of: `dsa`, `systems`, `cs-fundamentals`, `networking`
- [ ] All question IDs are kebab-case and globally unique
- [ ] The daily seed shuffle uses `seedrandom` with the date as seed — the same date always produces the same order

---

## 11. Badge Rules

- [ ] All badge creation goes through `ensureBadge()` — no duplicates for milestone badges
- [ ] Streak badges (7, 30, 100 days) are awarded at the exact threshold — checked in `checkStreakBadges()` after every daily submission
- [ ] Duel badges (`FIRST_DUEL`, `DUEL_MASTER` at 50 wins, `ULTIMATE_DUEL` for beating rank 10) are checked in `checkDuelBadges()` after every completed duel
- [ ] Weekly competition badges are date-stamped with the competition's `weekStart`
- [ ] `ULTIMATE_GEEK` badge replaces `RANK_UP` badge when reaching tier 10 — both are not awarded
- [ ] Badges are never revoked — once awarded they are permanent

---

## 12. Infrastructure & Resource Rules

- [ ] Every Docker container has explicit CPU and memory limits in `docker-compose.yml`
- [ ] API: max 0.80 CPU, 512MB RAM
- [ ] Web: max 0.10 CPU, 64MB RAM
- [ ] PostgreSQL: max 0.50 CPU, 768MB RAM
- [ ] Redis: max 0.20 CPU, 256MB RAM
- [ ] Judge0: max 0.80 CPU, 512MB RAM
- [ ] Total allocated: under 1.9 cores and 2.8GB — leaves headroom on the 4GB/2-core VPS
- [ ] Redis `maxmemory` is set to 256MB with `allkeys-lru` eviction — it never grows beyond this
- [ ] Postgres `max_connections` is set to 50 — the API connection pool is set to 5–7, well within this
- [ ] The `nginx/codearena.conf` file sets `proxy_read_timeout 86400s` — without this nginx kills WebSocket connections after 60 seconds, dropping active duels
- [ ] The `codearena-internal` Docker network is a private bridge — never exposed to the internet
- [ ] Judge0 is connected to `codearena-internal` after startup — the API reaches it via the hostname `judge0`, not `localhost`
- [ ] The `nginx-proxy` external network exists before `docker compose up` — CodeArena joins it, does not create it

---

## 13. Security Rules

- [ ] `.env` is in `.gitignore` — never committed
- [ ] `.env.local` is in `.gitignore` — never committed
- [ ] `questions/coding/solutions/` is in `.gitignore` — reference solutions never committed
- [ ] JWT secret is never logged — no `console.log(process.env.JWT_SECRET)` anywhere
- [ ] GitHub Client Secret is never returned in any API response
- [ ] The correct answer (`answer` field) is stripped from every question before it leaves the server — in both REST responses and WebSocket pushes
- [ ] WebSocket scoring is server-side only — the client has no way to submit a pre-scored result
- [ ] Duel invite tokens are single-use — once Player B joins, the token cannot be reused to join a third time
- [ ] Code submitted to Judge0 runs in an isolated sandbox with no network access, no file system writes, and a 5-second CPU limit
- [ ] CORS origins are an explicit whitelist — never `*` in production

---

## 14. CI/CD Rules

- [ ] No PR can be merged to `main` without all three CI jobs passing: `validate-questions`, `test-solutions`, `build`
- [ ] `validate-questions` catches: missing required fields, invalid types, invalid topics, invalid difficulties, missing test files for coding questions
- [ ] `check-duplicates.js` catches duplicate question IDs across all JSON files
- [ ] `test-solutions.js` runs every reference solution against its test suite — a PR with a failing solution is blocked
- [ ] The CD pipeline runs a health check after deploy — if `curl http://localhost:3000/docs` fails, the deployment is marked failed
- [ ] Migrations run automatically on every deploy via `entrypoint.sh` — never manually
- [ ] Only `codearena-api` and `codearena-web` are rebuilt on deploy — `codearena-db` and `codearena-redis` keep running throughout

---

Run through every checked box before going live. Any unchecked item is either a bug, a missing config value, or a deployment step not yet completed.
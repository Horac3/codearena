# Decisions

Append-only log. Newest at the bottom. `/decide` drafts entries in this shape; supersede an entry by
adding a new one that references it, never by editing history.

## D-001: Use claude-kit workflow
Date: 2026-11-08
Status: accepted
Context: Sessions need consistent rules, cheap context, and clean handoffs between conversations and models.
Decision: Follow the claude-kit loop: `/next` per roadmap step, test-first, `opusplan` with delegated
subagents, state in `docs/progress.md`.
Consequences: Every conversation starts with `/next` and ends with `/handoff`.
Revisit if: the overhead outweighs the benefit for this project.

## D-002: Points are atomic and idempotent, keyed on their source
Date: 2026-11-08
Status: accepted
Context: Awards were read-then-write (concurrent awards lost updates) and could repeat (coding XP on
every resubmission, BullMQ retries, a re-run weekly close).
Decision: `RankingService.awardPoints` locks the user row (`FOR NO KEY UPDATE`) inside a transaction and
writes a `RankEvent` that is unique on `(userId, reason, sourceId)`. A repeat with the same source is a
no-op that returns `duplicate: true`. Callers pick the source: date for Daily Blitz, duel id, question
id for coding (so XP is paid once per question), competition id, `week:<date>` for the leaderboard.
Badges are unique on `(userId, type, scope)`; repeatable badges use a scope (week, tier).
Consequences: Every new award must choose a stable sourceId. Pass `{ tx }` when awarding inside another
transaction so the award commits or rolls back with it.
Revisit if: awards need to be reversible (add a compensating event, not a delete).

## D-003: Duels run on one API instance
Date: 2026-11-08
Status: accepted
Context: The server now owns the question timer and the reconnect grace period. Both are in-process
timers, as are the room lock and the local room cache, and Socket.IO has no Redis adapter.
Decision: Keep duels single-instance (the single-VPS deployment). Room state is mirrored to Redis so a
restart can recover a room, but timers are not.
Consequences: Scaling the API past one instance needs the Socket.IO Redis adapter, sticky sessions, and
a shared timer (e.g. BullMQ delayed jobs) before it is safe. Crons already take a Redis lock.
Revisit if: a second API instance is planned.

## D-004: Coding submissions run in an isolated V8 context behind a per-run marker
Date: 2026-11-08
Status: accepted
Context: User code ran in the same scope as the test runner and the server trusted the last line of
stdout, so a submission could print a fake "all passed" result.
Decision: The harness (`jobs/code-harness.ts`) evaluates user code with `node:vm` in a fresh context with
no `require`/`process`, passes values across as JSON, prints results after a random marker read from
stdin, and the server checks the test names against the test file. TypeScript is transpiled server-side
and run as JavaScript. Only JavaScript and TypeScript are accepted until other languages get a harness.
Consequences: Tests can only use the harness's `expect` matchers. `vm` is not a security boundary on
its own; Judge0/isolate remains the sandbox.
Revisit if: Python or Go questions are added (they need their own harness).

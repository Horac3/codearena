# Progress

State lives here, not in chat history. `/next` reads "Current step" and "Handoff notes";
`/handoff` rewrites them. Markers: `[ ]` todo · `[~]` in progress · `[x]` done.

## Roadmap
From the November 2026 review (failure points and improvements).
- [x] 1. Make it playable: question loader flattens array files and validates at startup; webview uses
      CSP-safe delegated click handlers; duel creator receives room events.
- [x] 2. Make it count: Daily Blitz submitted and scored server-side against the stored set; UTC streaks;
      weeklyXp from daily, duel and coding play.
- [x] 3. Make duels reliable: server question timer, current-question check, atomic join by invite token,
      transactional finalize, 30s reconnect grace then forfeit.
- [x] 4. Make points trustworthy: atomic, idempotent awards (D-002); once-per-question coding XP;
      isolated harness with a per-run marker (D-004); no retries of user-code failures.
- [x] 5. Harden: rate limits, body and DTO limits, WS payload validation, job ownership, OAuth state,
      maintainer allow-list, contribution snapshot privacy, Redis noeviction, CD gated on CI, JWT secret
      enforced in production, Swagger off in production.
- [x] 6. Test the loops: e2e tests for daily submit, a full Socket.IO duel, coding vs a stub Judge0,
      concurrent awards and a re-run weekly close.
- [ ] 7. Answers are public: the question bank (answers included) is in the public repo. Decide whether
      to move answer keys server-side or accept it and lean on speed.
- [ ] 8. Practice mode and a coding editor in the webview (the API side works; the panel shows "coming soon").
- [ ] 9. Python/Go coding harnesses (rejected with a 400 until then).
- [ ] 10. Scaling past one API instance (D-003).

## Current step
Step 7: decide how to handle public answer keys
Requirements: —
Status: not started

## Handoff notes
- Run the e2e suite locally with `docker compose -f docker-compose.test.yml up -d`, then
  `cd apps/api && npm run test:e2e`.
- New env vars: MAINTAINER_GITHUB_IDS, CI_WEBHOOK_SECRET, SWAGGER_ENABLED (see .env.example).
- Next action: /decide on step 7.

## Log
- 2026-11-08: Steps 1–6 implemented in one PR (review fixes).

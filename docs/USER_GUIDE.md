# CodeArena ⚡ — User Guide

> Keep your developer skills sharp without leaving VS Code.

---

## Installation

1. Open VS Code
2. Press `Ctrl+Shift+X` (or `Cmd+Shift+X` on Mac)
3. Search **CodeArena**
4. Click **Install**

Then click the ⚡ icon in the Activity Bar (left sidebar) to open CodeArena.

---

## Sign In

CodeArena uses your GitHub account — no new password needed.

1. Click **Sign in with GitHub** in the sidebar
2. Your browser opens GitHub's authorisation page
3. Approve access
4. VS Code receives your session automatically

> CodeArena only reads your public GitHub profile (username and avatar).
> It never accesses your repositories or private data.

---

## Daily Blitz

Every day at midnight UTC, 5 fresh questions are seeded for the platform.
Every developer gets the **same 5 questions** — making the leaderboard fair.

**How to play:**
- Click **Daily Blitz** in the sidebar (or press `Ctrl+Shift+P` → "CodeArena: Open Daily Blitz")
- Answer each question before the 60-second timer runs out
- Faster correct answers earn a speed bonus
- Your explanation is shown immediately after each answer
- One attempt per day — results are final

**Scoring:**

| Action | Points |
|---|---|
| Correct answer | +50 pts |
| Speed bonus (under 10s) | +30 pts (decays to 0 at 60s) |
| Perfect score (5/5) | +100 pts bonus |
| Completing any set | +25 pts |
| Streak multiplier | ×1.0 – ×2.0 |

A 10-day streak doubles all your points. Missing a day resets your streak to 1.

---

## Duel Mode

Challenge any developer to a real-time head-to-head battle.

**Creating a duel:**
1. Click **Duel Mode** in the sidebar
2. Select a topic and number of rounds (5 or 7)
3. Click **Generate invite link**
4. The link is copied to your clipboard — share it via Slack, email, or anywhere

**Accepting a duel:**
1. Click the invite link in your browser
2. Click **Accept in VS Code**
3. The extension opens and joins the room

**During a duel:**
- Both players see the same question at exactly the same time
- 60 seconds per question
- Scores update in real time after both players answer
- If your opponent disconnects, the duel is marked abandoned

**Duel scoring (asymmetric by rank):**

| Outcome | Points |
|---|---|
| Win vs higher rank | +80 to +140 pts |
| Win vs same rank | +50 pts |
| Win vs lower rank | +25 pts |
| Draw | +20 pts each |
| Loss vs higher rank | −5 pts |
| Loss vs same rank | −15 pts |
| Loss vs lower rank | −30 pts |

> Duel invites expire after 24 hours.

---

## Weekly Competition

Every week, a themed competition runs **Thursday through Sunday**.

- **Thursday:** competition opens with 10 questions on the weekly theme
- The theme rotates weekly: DSA → System Design → CS Fundamentals → Networking → Mixed
- **One attempt** per developer per week
- **Sunday midnight:** competition closes
- **Monday:** results announced, rank points awarded

**Prizes:**

| Finish | Points | Badge |
|---|---|---|
| #1 | +1,000 pts | Weekly Champion (date-stamped) |
| #2 | +600 pts | Weekly Podium |
| #3 | +400 pts | Weekly Podium |
| Top 10 | +200 pts | Weekly Top 10 |
| Top 25 | +100 pts | — |
| Any submission | +50 pts | — |

Weekly competition questions are harder (difficulty 2–3 only).
No coding challenges in competition mode.

---

## Rank Ladder

Your rank is permanent and reflects your total accumulated points.
It never resets — only the weekly leaderboard resets.

| Tier | Title | Points needed |
|---|---|---|
| 1 | Script Kiddie | 0 |
| 2 | Code Monkey | 300 |
| 3 | Bug Hunter | 900 |
| 4 | Stack Overflow Refugee | 2,000 |
| 5 | Algorithm Apprentice | 4,500 |
| 6 | Architecture Architect | 8,500 |
| 7 | System Sage | 14,000 |
| 8 | Kernel Wizard | 22,000 |
| 9 | Distributed Deity | 32,000 |
| 10 | **Ultimate Geek** | 45,000 |

A dedicated developer doing daily blitz, duels, and weekly competitions
can reach Ultimate Geek in **4–5 months**.

**Floor protection:** When you reach a new rank tier, you cannot fall back below
it until you have completed 10 duels at that tier. Bad days won't erase weeks of progress.

---

## Practice Mode

Drill any topic on demand without affecting your daily blitz attempt.

Available topics: DSA, System Design, CS Fundamentals, Networking

Question types: Multiple choice, Trace the output, Bug hunt, Coding challenges

---

## Coding Challenges

Write a real function and run it against hidden test cases.

**Supported languages:** JavaScript, TypeScript, Python, Go

**How it works:**
1. Open a coding challenge in Practice mode
2. Select your language
3. Write your solution in the code editor
4. Click **Run tests**
5. Results appear instantly — each test case shows pass/fail

Coding challenges award **+25 pts per passing test case**.
You can resubmit as many times as you want.

---

## Pomodoro Timer

The Pomodoro timer integrates CodeArena into your work rhythm.

**Default settings:**
- Work session: 25 minutes
- Short break: 5 minutes
- Long break: 15 minutes (every 4 cycles)

When a work session ends, CodeArena prompts you to open Daily Blitz during your break.

**Controls:**
- Click the 🍅 timer in the status bar to start/pause/reset
- `Ctrl+Shift+P` → "CodeArena: Pomodoro Control" for full options

**Customise via VS Code settings (`Ctrl+,` → search "CodeArena"):**
- `codearena.pomodoro.workMinutes`
- `codearena.pomodoro.breakMinutes`
- `codearena.pomodoro.longBreakMinutes`
- `codearena.pomodoro.autoPromptBlitz` (toggle the Daily Blitz prompt)

---

## Leaderboard

**Weekly leaderboard** — resets every Monday midnight UTC.
Tracks weekly XP earned, not total rank points. Anyone can top it in any given week.

**All-time rank ladder** — never resets. Your permanent progression.

Both are visible in the CodeArena sidebar.

---

## Badges

Badges appear on your profile and are permanently dated.

| Badge | How to earn |
|---|---|
| 🔥 Streak 7 / 30 / 100 | Consecutive daily activity |
| ⚔ First Duel | Win your first duel |
| ⚔ Duel Master | 50 duel wins |
| ⚔ Ultimate Duel | Defeat a rank 10 player |
| 🏆 Weekly Champion | Win a weekly competition |
| 📝 Question Author | Have a question merged |
| 📚 Content Creator | 5 questions merged |
| 🎓 Curriculum Architect | 20 questions merged |
| 🎖 Community Reviewer | Become an approved reviewer |

---

## Settings

Open `Ctrl+,` and search **CodeArena**:

| Setting | Default | Description |
|---|---|---|
| `codearena.apiUrl` | `https://api.codearena.dev` | Change to self-host |
| `codearena.showStatusBar` | `true` | Show streak in status bar |
| `codearena.pomodoro.*` | various | Pomodoro preferences |

---

## FAQ

**Is CodeArena free?**
Yes — free, open source, MIT licence.

**Can I play offline?**
Daily Blitz questions are cached for 24 hours. Duels and leaderboard require a connection.

**What data does CodeArena collect?**
Your GitHub username, avatar, and game activity (answers, XP, streaks). No repository access.

**Can I self-host?**
Yes. Set `codearena.apiUrl` to your own server. See `docs/deployment.md`.

**I found a bug — where do I report it?**
Open an issue on GitHub: `github.com/your-org/codearena/issues`

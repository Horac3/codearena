# CodeArena ⚡

> A VS Code extension that keeps developers sharp — daily challenges, real-time duels, leaderboards.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

---

## What is CodeArena?

CodeArena is an open-source VS Code extension that turns idle developer time into sharpening sessions. Daily blitz quizzes, head-to-head duels, leaderboards, and a growing community question bank — all without leaving your editor.

**Game modes:**
- **Daily Blitz** — 5 questions each day, seeded so everyone competes on the same set
- **Duel Mode** — challenge a colleague to a real-time head-to-head match
- **Practice** — drill specific topics: DSA, System Design, CS Fundamentals, Networking
- **Coding Challenges** — submit real code, run against unit tests (coming in v1.1)

---

## Project Structure

```
codearena/
├── apps/
│   ├── extension/        # VS Code extension (TypeScript)
│   ├── api/              # NestJS backend + WebSocket gateway
│   └── web/              # Landing page + invite handler
├── packages/
│   └── question-schema/  # Shared TypeScript types for questions
├── questions/            # Community question bank (JSON)
│   ├── dsa/
│   ├── systems/
│   ├── cs-fundamentals/
│   └── networking/
├── docker-compose.yml
└── CONTRIBUTING.md
```

---

## Getting Started

### Prerequisites
- Node.js >= 18
- Docker + Docker Compose
- VS Code (to run the extension)

### Local Development

```bash
# Clone the repo
git clone https://github.com/your-org/codearena.git
cd codearena

# Install all dependencies
npm install

# Start the backend stack
docker-compose up -d codearena-db codearena-redis

# Start the API
npm run dev:api

# Open the extension in VS Code
cd apps/extension
npm run watch
# Then press F5 in VS Code to launch the Extension Development Host
```

---

## Contributing Questions

We welcome question contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide.

**MCQ / Trace / Bug-hunt questions** — add a JSON file to the relevant `questions/` folder.

**Coding challenges** — you must provide:
1. The question definition (JSON)
2. A test suite (Jest) that validates correct solutions
3. A reference solution (kept private, used for validation only)

Questions go through automated schema validation and a human review before merging.

---

## Deployment

CodeArena uses Docker Compose behind nginx-proxy + acme-companion. See [docs/deployment.md](docs/deployment.md) for the full VPS setup guide.

---

## License

MIT — see [LICENSE](LICENSE).

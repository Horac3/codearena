# Deployment Guide

This guide covers deploying CodeArena to your VPS using Docker Compose and your existing nginx-proxy + acme-companion stack.

---

## Prerequisites

- VPS with Docker and Docker Compose installed
- The `nginx-proxy` external network already running (from your existing projects)
- A domain pointed at your VPS — `codearena.never9to5ive.com` (or your own)
- GitHub OAuth app credentials

---

## 1. Create a GitHub OAuth App

Go to **GitHub → Settings → Developer settings → OAuth Apps → New OAuth App**.

| Field | Value |
|-------|-------|
| Application name | CodeArena |
| Homepage URL | `https://codearena.never9to5ive.com` |
| Authorization callback URL | `https://api.codearena.never9to5ive.com/auth/github/callback` |

Copy the **Client ID** and **Client Secret** — you'll need them in `.env`.

---

## 2. Clone and configure

```bash
git clone https://github.com/your-org/codearena.git
cd codearena

cp .env.example .env
nano .env   # fill in all values
```

Key values to set in `.env`:

```env
LETSENCRYPT_EMAIL=you@example.com
JWT_SECRET=<generate with: openssl rand -hex 32>
GITHUB_CLIENT_ID=<from GitHub OAuth app>
GITHUB_CLIENT_SECRET=<from GitHub OAuth app>
POSTGRES_PASSWORD=<strong password>
```

---

## 3. Deploy

```bash
# Build and start all services
docker compose up -d --build

# Watch logs
docker compose logs -f codearena-api
```

Prisma migrations run automatically on API startup via `entrypoint.sh`.

---

## 4. Verify

```bash
# API health
curl https://api.codearena.never9to5ive.com/docs

# Check all containers are healthy
docker compose ps
```

---

## 5. Enable coding challenges with Judge0

Judge0 is the code execution engine for CodeArena. It runs as a separate Docker Compose stack on the same VPS.

### Install Judge0 (ARM64 compatible)

```bash
# Create a directory for Judge0
mkdir -p ~/judge0
cd ~/judge0

# Download Judge0's docker-compose.yml
wget https://github.com/judge0/judge0/releases/download/v1.13.0/docker-compose.yml

# Download the configuration file
wget https://github.com/judge0/judge0/releases/download/v1.13.0/judge0.conf

# Edit judge0.conf to set your preferences (optional)
nano judge0.conf
```

### Configure Judge0

Key settings in `judge0.conf`:

```bash
# Set authentication token (recommended for production)
AUTHENTICATION_TOKEN=your-secure-token-here

# Enable only the languages you need (reduces resource usage)
ENABLE_WAIT_RESULT=true
ENABLE_COMPILER_OPTIONS=false
```

### Start Judge0

```bash
# Start Judge0 stack
docker compose up -d

# Verify all containers are running
docker compose ps

# Check logs
docker compose logs -f
```

### Connect Judge0 to CodeArena

Judge0 runs on its own Docker network. Connect the Judge0 worker to CodeArena's internal network:

```bash
# Find the Judge0 worker container name
docker ps | grep judge0-worker

# Connect it to codearena-internal network
docker network connect codearena-internal judge0-worker-1
```

### Configure CodeArena to use Judge0

Update your `.env` file:

```bash
JUDGE0_URL=http://judge0-server:2358
JUDGE0_AUTH_TOKEN=your-secure-token-here  # if you set one in judge0.conf
```

Restart CodeArena API:

```bash
cd ~/codearena
docker compose restart codearena-api
```

### Verify Judge0 is working

```bash
# Test Judge0 API directly
curl http://localhost:2358/about

# Check supported languages
curl http://localhost:2358/languages
```

The languages CodeArena uses:
- **JavaScript (Node.js 18)**: Language ID 93
- **TypeScript**: Language ID 94
- **Python 3**: Language ID 71
- **Go**: Language ID 95

---

## Updating

```bash
git pull
docker compose up -d --build codearena-api codearena-web
```

Migrations run automatically on restart.

---

## WebSocket nginx config

The WebSocket upgrade header must pass through nginx-proxy. Create this file on your host and mount it into the nginx-proxy container:

```bash
# /path/to/nginx-proxy/conf.d/codearena-ws.conf
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
proxy_read_timeout 86400;
```

Without `proxy_read_timeout 86400`, nginx will close idle WebSocket connections after 60 seconds, silently dropping players mid-duel.

---

## Backups

```bash
# Backup Postgres
docker compose exec codearena-db \
  pg_dump -U codearena codearena | gzip > codearena_$(date +%Y%m%d).sql.gz

# Restore
gunzip -c codearena_20240101.sql.gz | \
  docker compose exec -T codearena-db psql -U codearena codearena
```

# Local Development Setup Guide

This guide will help you set up CodeArena for local development.

## Prerequisites

- **Docker Desktop** (or Docker Engine + Docker Compose)
- **Git**
- **Node.js 18+** (optional, only if running outside Docker)
- **GitHub OAuth App** for authentication

## Quick Start

### 1. Clone the Repository

```bash
git clone <repository-url>
cd codearena
```

### 2. Configure Environment Variables

Copy the example environment file:

```bash
cp .env.local.example .env.local
```

Edit `.env.local` and configure the following:

#### Required: GitHub OAuth

Create a GitHub OAuth App for local development:

1. Go to GitHub → Settings → Developer settings → OAuth Apps
2. Click "New OAuth App"
3. Fill in:
   - **Application name**: CodeArena Local Dev
   - **Homepage URL**: `http://localhost:5173`
   - **Authorization callback URL**: `http://localhost:3000/auth/github/callback`
4. Copy the Client ID and Client Secret to `.env.local`:

```env
GITHUB_CLIENT_ID=your_client_id_here
GITHUB_CLIENT_SECRET=your_client_secret_here
```

#### Optional: JWT Secret

For better security, generate a random JWT secret:

```bash
# On Linux/Mac:
openssl rand -base64 32

# On Windows (PowerShell):
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }))
```

Update in `.env.local`:

```env
JWT_SECRET=your_generated_secret_here
```

### 3. Start the Development Environment

Start all services using Docker Compose:

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build
```

This will:
- Build the API and web containers
- Start PostgreSQL database
- Start Redis cache
- Run database migrations automatically
- Start the API with hot reload on port 3000
- Start the web dev server on port 5173

### 4. Verify Services are Running

Check container status:

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml ps
```

You should see:
- `codearena-api` - Running on port 3000
- `codearena-web` - Running on port 5173
- `codearena-db` - PostgreSQL on port 5432
- `codearena-redis` - Redis on port 6379

### 5. Access the Application

- **Web Interface**: http://localhost:5173
- **API**: http://localhost:3000
- **API Health Check**: http://localhost:3000/health (if available)

## Development Workflow

### Hot Reload

Both the API and web app support hot reload:

- **API**: Uses `ts-node-dev` - changes to `apps/api/src/**` trigger automatic restart
- **Web**: Uses Vite HMR - changes to `apps/web/**` update instantly in browser

### View Logs

```bash
# All services
docker compose -f docker-compose.yml -f docker-compose.local.yml logs -f

# Specific service
docker compose -f docker-compose.yml -f docker-compose.local.yml logs -f codearena-api
docker compose -f docker-compose.yml -f docker-compose.local.yml logs -f codearena-web
```

### Stop Services

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml down
```

### Restart Services

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml restart
```

### Clean Restart (Remove Volumes)

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml down -v
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build
```

## Database Management

### Access PostgreSQL

```bash
# Using docker exec
docker exec -it codearena-db psql -U codearena -d codearena

# Using local psql (if installed)
psql -h localhost -p 5432 -U codearena -d codearena
# Password: localpassword
```

### Run Migrations Manually

Migrations run automatically on container start, but you can run them manually:

```bash
docker exec -it codearena-api npx prisma migrate dev --schema=./prisma/schema.prisma
```

### Reset Database

```bash
docker exec -it codearena-api npx prisma migrate reset --schema=./prisma/schema.prisma
```

## Redis Management

### Access Redis CLI

```bash
docker exec -it codearena-redis redis-cli
```

### Clear Redis Cache

```bash
docker exec -it codearena-redis redis-cli FLUSHALL
```

## Troubleshooting

### Port Conflicts

If you get port binding errors, check for conflicting services:

```bash
# Check what's using port 3000, 5173, 5432, or 6379
netstat -tulpn | grep :3000
netstat -tulpn | grep :5173
netstat -tulpn | grep :5432
netstat -tulpn | grep :6379
```

### Build Failures

Clear Docker build cache:

```bash
docker system prune -a
docker compose -f docker-compose.yml -f docker-compose.local.yml build --no-cache
```

### Database Connection Issues

1. Ensure PostgreSQL container is healthy:
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.local.yml ps codearena-db
   ```

2. Check database logs:
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.local.yml logs codearena-db
   ```

### API Not Starting

1. Check API logs:
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.local.yml logs codearena-api
   ```

2. Verify environment variables in `.env.local`

3. Ensure GitHub OAuth credentials are correct

## Optional: Judge0 Setup

For coding challenge execution, you can optionally set up Judge0:

1. Follow the Judge0 installation guide in `docs/deployment.md`
2. Update `.env.local` with Judge0 URL:
   ```env
   JUDGE0_URL=http://judge0:2358
   ```

## VS Code Extension Development

To develop the VS Code extension:

1. Open the project in VS Code
2. Navigate to `apps/extension`
3. Press F5 to launch Extension Development Host
4. The extension will be loaded in the new VS Code window

Build the extension:

```bash
npm run build:extension
```

## Monorepo Commands

The project uses npm workspaces. Run commands from the root:

```bash
# Install dependencies for all workspaces
npm install

# Run API in dev mode
npm run dev:api

# Run web in dev mode
npm run dev:web

# Build API
npm run build:api

# Build extension
npm run build:extension

# Lint all workspaces
npm run lint

# Test all workspaces
npm run test
```

## Next Steps

- Read `docs/ARCHITECTURE.md` to understand the system design
- Check `docs/CONTRIBUTOR_GUIDE.md` for contribution guidelines
- Explore the question bank in `questions/` directory
- Review the API endpoints in `apps/api/src/`
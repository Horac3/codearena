# CodeArena Local Development Setup

## ✅ Setup Completed

The following has been configured for local development:

### 1. Environment Configuration
- ✅ `.env.local` created with local development settings
- ✅ `.env` created for Docker Compose compatibility
- ✅ Database credentials configured (user: codearena, pass: localpassword)
- ✅ Local URLs configured (API: localhost:3000, Web: localhost:5173)

### 2. Docker Configuration
- ✅ `docker-compose.local.yml` fixed to use correct build contexts
- ✅ Database (PostgreSQL) container running and healthy
- ✅ Redis container running and healthy
- ⏳ API and Web containers building (in progress)

### 3. Documentation
- ✅ `docs/LOCAL_SETUP.md` - Comprehensive setup guide
- ✅ `start-local.sh` - Quick start script for Linux/Mac
- ✅ `start-local.ps1` - Quick start script for Windows

## 🚀 Quick Start

### Prerequisites
1. **Docker Desktop** installed and running
2. **GitHub OAuth App** for local development

### Setup GitHub OAuth (Required)

1. Go to https://github.com/settings/developers
2. Click "New OAuth App"
3. Fill in:
   - **Application name**: CodeArena Local Dev
   - **Homepage URL**: `http://localhost:5173`
   - **Authorization callback URL**: `http://localhost:3000/auth/github/callback`
4. Copy the Client ID and Client Secret
5. Update `.env.local`:
   ```env
   GITHUB_CLIENT_ID=your_client_id_here
   GITHUB_CLIENT_SECRET=your_client_secret_here
   ```

### Start Development Environment

**Windows (PowerShell):**
```powershell
.\start-local.ps1
```

**Linux/Mac:**
```bash
chmod +x start-local.sh
./start-local.sh
```

**Manual Start:**
```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build
```

## 📊 Current Status

### Running Services
- ✅ **PostgreSQL** - Port 5432 (healthy)
- ✅ **Redis** - Port 6379 (healthy)
- ⏳ **API** - Port 3000 (building)
- ⏳ **Web** - Port 5173 (building)

### Check Status
```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml ps
```

### View Logs
```bash
# All services
docker compose -f docker-compose.yml -f docker-compose.local.yml logs -f

# Specific service
docker compose -f docker-compose.yml -f docker-compose.local.yml logs -f codearena-api
```

## 🔧 Troubleshooting

### Build Taking Too Long
If the Docker build is taking too long or appears stuck:

1. **Cancel the current build:**
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.local.yml down
   ```

2. **Clear Docker cache:**
   ```bash
   docker system prune -a
   ```

3. **Rebuild:**
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build
   ```

### Port Conflicts
If you get "port already in use" errors:

1. **Check what's using the ports:**
   ```bash
   # Windows (PowerShell)
   Get-NetTCPConnection -LocalPort 3000,5173,5432,6379

   # Linux/Mac
   lsof -i :3000
   lsof -i :5173
   lsof -i :5432
   lsof -i :6379
   ```

2. **Stop conflicting containers:**
   ```bash
   docker ps
   docker stop <container_name>
   ```

### Database Connection Issues
```bash
# Check database health
docker compose -f docker-compose.yml -f docker-compose.local.yml ps codearena-db

# View database logs
docker compose -f docker-compose.yml -f docker-compose.local.yml logs codearena-db

# Connect to database
docker exec -it codearena-codearena-db-1 psql -U codearena -d codearena
```

### API Not Starting
```bash
# View API logs
docker compose -f docker-compose.yml -f docker-compose.local.yml logs codearena-api

# Restart API
docker compose -f docker-compose.yml -f docker-compose.local.yml restart codearena-api
```

## 📁 Project Structure

```
codearena/
├── .env.local              # Local environment variables (DO NOT COMMIT)
├── .env                    # Base environment variables (DO NOT COMMIT)
├── docker-compose.yml      # Production Docker config
├── docker-compose.local.yml # Local development overrides
├── start-local.sh          # Quick start script (Linux/Mac)
├── start-local.ps1         # Quick start script (Windows)
├── apps/
│   ├── api/               # NestJS API
│   │   ├── Dockerfile.local
│   │   └── src/
│   ├── web/               # Vite landing page
│   │   ├── Dockerfile.local
│   │   └── src/
│   └── extension/         # VS Code extension
├── docs/
│   ├── LOCAL_SETUP.md     # Detailed setup guide
│   ├── ARCHITECTURE.md    # System architecture
│   └── deployment.md      # Production deployment
└── questions/             # Question bank
```

## 🎯 Next Steps

Once all containers are running:

1. **Access the application:**
   - Web: http://localhost:5173
   - API: http://localhost:3000

2. **Verify database migrations:**
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.local.yml logs codearena-api | grep migration
   ```

3. **Test the API:**
   ```bash
   curl http://localhost:3000/health
   ```

4. **Develop the VS Code extension:**
   - Open `apps/extension` in VS Code
   - Press F5 to launch Extension Development Host

## 📚 Additional Resources

- **Full Setup Guide**: `docs/LOCAL_SETUP.md`
- **Architecture**: `docs/ARCHITECTURE.md`
- **Contributing**: `CONTRIBUTING.md`
- **Deployment**: `docs/deployment.md`

## 🧪 Running Tests

### Unit Tests
```bash
npm run test
```

### Integration Tests

Requires the test database and Redis containers. These use **different ports** (5433 / 6380) to avoid conflicting with your local dev services.

```bash
# Start test services
docker compose -f docker-compose.test.yml up -d

# Run integration tests
cd apps/api && npm run test:e2e
```

CI runs integration tests automatically via GitHub Actions service containers.

---

## 🛑 Stop Development Environment

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml down
```

To also remove volumes (database data):
```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml down -v
```

## 💡 Tips

- **Hot Reload**: Both API and web support hot reload - changes are reflected automatically
- **Database GUI**: Use TablePlus, DBeaver, or pgAdmin to connect to localhost:5432
- **Redis GUI**: Use RedisInsight or redis-cli to inspect cache
- **Logs**: Keep logs open in a separate terminal for debugging

## ⚠️ Important Notes

- Never commit `.env` or `.env.local` files
- GitHub OAuth credentials are required for authentication
- Database migrations run automatically on API startup
- Judge0 (code execution) is optional for local development
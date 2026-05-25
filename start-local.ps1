# Quick start script for local development (PowerShell)

Write-Host "🚀 Starting CodeArena local development environment..." -ForegroundColor Green

# Check if .env.local exists
if (-not (Test-Path .env.local)) {
    Write-Host "❌ .env.local not found!" -ForegroundColor Red
    Write-Host "📝 Creating .env.local from template..." -ForegroundColor Yellow
    Copy-Item .env.local.example .env.local
    Write-Host "⚠️  Please edit .env.local and add your GitHub OAuth credentials" -ForegroundColor Yellow
    Write-Host "   Visit: https://github.com/settings/developers" -ForegroundColor Cyan
    exit 1
}

# Check if GitHub credentials are configured
$envContent = Get-Content .env.local -Raw
if ($envContent -match "your-github-client-id-here") {
    Write-Host "⚠️  GitHub OAuth credentials not configured in .env.local" -ForegroundColor Yellow
    Write-Host "   Please update GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET" -ForegroundColor Yellow
    Write-Host "   Visit: https://github.com/settings/developers" -ForegroundColor Cyan
    exit 1
}

# Start services
Write-Host "🐳 Starting Docker containers..." -ForegroundColor Cyan
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build

# Wait for services to be healthy
Write-Host "⏳ Waiting for services to be ready..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# Check status
Write-Host ""
Write-Host "📊 Service Status:" -ForegroundColor Cyan
docker compose -f docker-compose.yml -f docker-compose.local.yml ps

Write-Host ""
Write-Host "✅ CodeArena is starting up!" -ForegroundColor Green
Write-Host ""
Write-Host "📍 Access points:" -ForegroundColor Cyan
Write-Host "   Web:   http://localhost:5173"
Write-Host "   API:   http://localhost:3000"
Write-Host "   DB:    localhost:5432 (user: codearena, pass: localpassword)"
Write-Host "   Redis: localhost:6379"
Write-Host ""
Write-Host "📝 View logs:" -ForegroundColor Cyan
Write-Host "   docker compose -f docker-compose.yml -f docker-compose.local.yml logs -f"
Write-Host ""
Write-Host "🛑 Stop services:" -ForegroundColor Cyan
Write-Host "   docker compose -f docker-compose.yml -f docker-compose.local.yml down"

#

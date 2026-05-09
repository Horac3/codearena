#!/bin/bash
# Quick start script for local development

echo "🚀 Starting CodeArena local development environment..."

# Check if .env.local exists
if [ ! -f .env.local ]; then
    echo "❌ .env.local not found!"
    echo "📝 Creating .env.local from template..."
    cp .env.local.example .env.local
    echo "⚠️  Please edit .env.local and add your GitHub OAuth credentials"
    echo "   Visit: https://github.com/settings/developers"
    exit 1
fi

# Check if GitHub credentials are configured
if grep -q "your-github-client-id-here" .env.local; then
    echo "⚠️  GitHub OAuth credentials not configured in .env.local"
    echo "   Please update GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET"
    echo "   Visit: https://github.com/settings/developers"
    exit 1
fi

# Start services
echo "🐳 Starting Docker containers..."
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build

# Wait for services to be healthy
echo "⏳ Waiting for services to be ready..."
sleep 5

# Check status
echo ""
echo "📊 Service Status:"
docker compose -f docker-compose.yml -f docker-compose.local.yml ps

echo ""
echo "✅ CodeArena is starting up!"
echo ""
echo "📍 Access points:"
echo "   Web:  http://localhost:5173"
echo "   API:  http://localhost:3000"
echo "   DB:   localhost:5432 (user: codearena, pass: localpassword)"
echo "   Redis: localhost:6379"
echo ""
echo "📝 View logs:"
echo "   docker compose -f docker-compose.yml -f docker-compose.local.yml logs -f"
echo ""
echo "🛑 Stop services:"
echo "   docker compose -f docker-compose.yml -f docker-compose.local.yml down"

# Made with Bob

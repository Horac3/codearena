#!/bin/sh
# apps/api/entrypoint.sh
set -e

echo "Running Prisma migrations..."
npx prisma migrate deploy --schema=./prisma/schema.prisma

echo "Starting CodeArena API..."
exec node dist/main.js

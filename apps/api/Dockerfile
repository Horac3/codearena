# apps/api/Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

# Install deps
COPY package*.json ./
COPY apps/api/package*.json ./apps/api/
COPY packages/question-schema/package*.json ./packages/question-schema/
RUN npm ci --workspace=apps/api --workspace=packages/question-schema

# Build question-schema package first
COPY packages/question-schema ./packages/question-schema
RUN npm run build --workspace=packages/question-schema

# Build API
COPY apps/api ./apps/api
RUN npm run build --workspace=apps/api
RUN npx prisma generate --schema=apps/api/prisma/schema.prisma

# ── Production image ──────────────────────────────────────────────────────
FROM node:20-alpine AS runner

RUN apk add --no-cache dumb-init
WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/prisma ./prisma
COPY --from=builder /app/packages/question-schema/dist ./packages/question-schema/dist

# Run migrations then start
COPY apps/api/entrypoint.sh ./entrypoint.sh
RUN chmod +x entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["dumb-init", "--"]
CMD ["./entrypoint.sh"]

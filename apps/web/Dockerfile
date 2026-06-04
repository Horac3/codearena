# apps/web/Dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json ./
COPY apps/web/package*.json ./apps/web/
RUN rm -f package-lock.json && npm install --workspace=apps/web
COPY apps/web ./apps/web
RUN npm run build --workspace=apps/web

FROM nginx:alpine AS runner
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

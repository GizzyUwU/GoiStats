FROM oven/bun:alpine AS builder
WORKDIR /usr/src/app
COPY --chown=bun:bun package.json bun.lock ./
RUN bun install

COPY --chown=bun:bun tsconfig*.json vite.config.ts index.html drizzle.config.ts ./
COPY --chown=bun:bun src ./src
COPY --chown=bun:bun public ./public

RUN bun run build:frontend

FROM nginx:mainline-alpine AS runner
RUN apk add --no-cache curl
COPY --from=builder /usr/src/app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 3000/tcp
CMD ["nginx", "-g", "daemon off;"]
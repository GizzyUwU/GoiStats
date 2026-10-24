FROM oven/bun:alpine AS builder
WORKDIR /usr/src/app
COPY --chown=bun:bun package.json bun.lock ./
RUN bun install

COPY --chown=bun:bun tsconfig*.json vite.config.ts index.html ./
COPY --chown=bun:bun src ./src
COPY --chown=bun:bun public ./public

RUN bun run build:frontend

FROM oven/bun:alpine AS runner
WORKDIR /usr/src/app
RUN apk add --no-cache curl su-exec jq
COPY --chown=bun:bun package.json bun.lock ./
RUN bun install --production

COPY --chown=bun:bun tsconfig*.json drizzle.config.ts ./
COPY --chown=bun:bun drizzle ./drizzle
COPY --chown=bun:bun server ./server
COPY --from=builder --chown=bun:bun /usr/src/app/dist ./dist
COPY --chown=bun:bun entrypoint.sh ./
RUN chmod +x /usr/src/app/entrypoint.sh
EXPOSE 8000/tcp
ENTRYPOINT ["/usr/src/app/entrypoint.sh"]

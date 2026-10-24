FROM oven/bun:alpine
WORKDIR /usr/src/app
RUN apk add --no-cache curl su-exec jq
COPY --chown=bun:bun package.json bun.lock ./
RUN bun install

COPY --chown=bun:bun tsconfig*.json vite.config.ts index.html drizzle.config.ts ./
COPY --chown=bun:bun drizzle ./drizzle
COPY --chown=bun:bun server.ts entrypoint.sh ./
RUN chmod +x /usr/src/app/entrypoint.sh
EXPOSE 8000/tcp
ENTRYPOINT ["/usr/src/app/entrypoint.sh"]

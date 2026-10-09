FROM oven/bun:alpine
WORKDIR /usr/src/app
RUN apk add --no-cache curl su-exec jq
COPY --chown=bun:bun package.json bun.lock tsconfig*.json vite.config.ts index.html ./
COPY --chown=bun:bun src ./src
COPY --chown=bun:bun public ./public
COPY --chown=bun:bun server.ts entrypoint.sh ./
RUN bun install
RUN bun run build:frontend
RUN chown bun:bun /usr/src/app
RUN chmod +x /usr/src/app/entrypoint.sh
EXPOSE 8000/tcp
ENTRYPOINT ["/usr/src/app/entrypoint.sh"]

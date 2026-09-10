FROM oven/bun:alpine
WORKDIR /usr/src/app
RUN apk add --no-cache curl su-exec jq
COPY --chown=bun:bun . .
RUN bun install --lockfile-only
RUN bun install --production
RUN chown bun:bun /usr/src/app
RUN chmod +x /usr/src/app/entrypoint.sh
EXPOSE 8000/tcp
ENTRYPOINT ["/usr/src/app/entrypoint.sh"]
FROM node:24-bookworm-slim AS native
WORKDIR /native
RUN npm install --omit=dev --no-audit --no-fund better-sqlite3@13.0.3

FROM node:24-bookworm-slim
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 DATABASE_PATH=/data/checkmates.sqlite
WORKDIR /app
COPY --chown=node:node app/ ./
COPY --from=native --chown=node:node /native/node_modules/ ./node_modules/
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3000
CMD ["sh","-c","node deploy/migrate.mjs && node server.js"]

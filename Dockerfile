FROM node:22-bookworm-slim AS frontend-builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS server-builder

WORKDIR /app/server

COPY server/package*.json ./
RUN npm ci

COPY server ./
RUN npm run build

FROM node:22-bookworm-slim

ENV NODE_ENV=production
ENV PORT=3000
ENV FRONTEND_DIST_DIR=/app/dist

WORKDIR /app

COPY server/package*.json ./server/
RUN cd server && npm ci --omit=dev

COPY --from=frontend-builder /app/dist ./dist
COPY --from=server-builder /app/server/dist ./server/dist

# Copy non-TS assets (.sql schemas) required at runtime into dist, since `tsc` does not emit them
COPY --from=server-builder /app/server/src/services/wireguard/wireguard-schema.sql ./server/dist/services/wireguard/wireguard-schema.sql
COPY --from=server-builder /app/server/src/services/agent/database ./server/dist/services/agent/database

WORKDIR /app/server

EXPOSE 3000

CMD ["node", "dist/index.js"]

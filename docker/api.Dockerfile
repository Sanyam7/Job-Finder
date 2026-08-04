# syntax=docker/dockerfile:1

# ── deps ─────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

# Copy only manifests first so the dependency layer is cached across code changes.
COPY package.json package-lock.json* ./
COPY shared/package.json ./shared/
COPY server/package.json ./server/

RUN npm ci --omit=dev --workspace=@verihire/server --include-workspace-root

# ── runtime ──────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

# dumb-init reaps zombies and forwards SIGTERM, which is what makes the graceful
# shutdown in server.js actually fire inside a container.
RUN apk add --no-cache dumb-init

COPY --from=deps /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node shared ./shared
COPY --chown=node:node server ./server

# Writable location for transient uploads (Cloudinary is the canonical store).
RUN mkdir -p /app/server/logs /app/server/uploads && chown -R node:node /app/server

# Never run as root.
USER node

EXPOSE 5000

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server/src/server.js"]

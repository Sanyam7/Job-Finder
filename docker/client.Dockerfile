# syntax=docker/dockerfile:1

# ── build ────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
COPY shared/package.json ./shared/
COPY client/package.json ./client/
RUN npm ci --workspace=@verihire/client --include-workspace-root

COPY shared ./shared
COPY client ./client

# Vite inlines env vars at build time, so the API URL must be known here, not at runtime.
ARG VITE_API_URL=/api/v1
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build --workspace=@verihire/client

# ── serve ────────────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/client/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

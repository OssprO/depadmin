# syntax=docker/dockerfile:1
# Production images (docs/adr/0026-despliegue-con-nginx.md), built from the repository root:
#   docker build --target api -t depadmin-api .
#   docker build --target web -t depadmin-web .

# ---- The whole workspace, installed and compiled ----
FROM node:24-bookworm-slim AS build
# Prisma picks its engines by the OpenSSL it finds; the runtime image has the same one.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true HUSKY=0
RUN corepack enable
WORKDIR /repo
# Dependencies first: a change in the code reuses this layer.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm fetch --frozen-lockfile
COPY . .
# Also builds @depadmin/shared and generates the Prisma Client (root postinstall).
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --offline
RUN pnpm --filter @depadmin/backend --filter @depadmin/frontend build
# The API's production dependencies alone (prisma among them, for the migrations).
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
  pnpm --filter @depadmin/backend deploy --prod --legacy /out/api

# ---- API: Node with the compiled backend; also runs the migrations ----
FROM node:24-bookworm-slim AS api
LABEL org.opencontainers.image.source="https://github.com/OssprO/depadmin"
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out/api/node_modules ./node_modules
COPY --from=build /out/api/package.json ./
COPY --from=build /repo/backend/dist ./dist
COPY --from=build /repo/backend/prisma ./prisma
COPY --from=build /repo/backend/prisma.config.ts ./
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "dist/main.js"]

# ---- Web: the built SPA behind nginx, which also proxies /api to the API ----
FROM nginxinc/nginx-unprivileged:1.30-alpine AS web
LABEL org.opencontainers.image.source="https://github.com/OssprO/depadmin"
COPY infra/web/default.conf /etc/nginx/conf.d/default.conf
COPY infra/web/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /repo/frontend/dist /usr/share/nginx/html
HEALTHCHECK --interval=15s --timeout=3s --retries=3 \
  CMD ["wget", "-q", "--spider", "http://127.0.0.1:8080/"]

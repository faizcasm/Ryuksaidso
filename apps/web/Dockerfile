FROM node:22-alpine AS base

WORKDIR /app

RUN corepack enable \
    && corepack prepare pnpm@10.15.0 --activate


# ============================================================
# Dependencies
# ============================================================

FROM base AS deps

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json ./apps/web/package.json

RUN pnpm install --no-frozen-lockfile --filter @ryuksaidso/web...


# ============================================================
# Builder
# ============================================================

FROM base AS builder

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

ARG NEXT_PUBLIC_API_URL=http://localhost:4001/api
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json ./apps/web/package.json
COPY apps/web ./apps/web

WORKDIR /app/apps/web

# Verify that Next actually exists before spending time building.
RUN pnpm exec next --version

RUN pnpm build


# ============================================================
# Production
# ============================================================

FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs \
    /app/apps/web/.next/standalone ./

COPY --from=builder --chown=nextjs:nodejs \
    /app/apps/web/.next/static \
    ./apps/web/.next/static

USER nextjs

EXPOSE 3000

CMD ["node", "apps/web/server.js"]

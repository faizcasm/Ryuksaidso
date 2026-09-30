FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml ./
COPY apps/worker/package.json apps/worker/package.json
COPY apps/api/package.json apps/api/package.json
COPY packages/agent-runtime/package.json packages/agent-runtime/package.json
COPY packages/agent-tools/package.json packages/agent-tools/package.json
RUN pnpm install --no-frozen-lockfile
COPY apps/worker apps/worker
COPY apps/api/prisma apps/api/prisma
COPY packages/agent-runtime packages/agent-runtime
COPY packages/agent-tools packages/agent-tools
RUN pnpm --filter @ryuksaidso/api prisma:generate
RUN pnpm --filter @ryuksaidso/agent-runtime build
RUN pnpm --filter @ryuksaidso/agent-tools build
RUN pnpm --filter @ryuksaidso/worker build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/worker/node_modules ./apps/worker/node_modules
COPY --from=build /app/apps/worker/dist ./apps/worker/dist
COPY --from=build /app/packages/agent-runtime/dist ./packages/agent-runtime/dist
COPY --from=build /app/packages/agent-tools ./packages/agent-tools
COPY package.json pnpm-workspace.yaml ./
COPY apps/worker/package.json apps/worker/package.json
COPY packages/agent-runtime/package.json packages/agent-runtime/package.json
COPY packages/agent-tools/package.json packages/agent-tools/package.json
WORKDIR /app/apps/worker
USER node
CMD ["node", "dist/index.js"]

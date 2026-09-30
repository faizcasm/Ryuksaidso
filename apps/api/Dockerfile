FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY packages/agent-tools/package.json packages/agent-tools/package.json
RUN pnpm install --no-frozen-lockfile
COPY apps/api apps/api
COPY packages/agent-tools packages/agent-tools
RUN pnpm --filter @ryuksaidso/agent-tools build
RUN pnpm --filter @ryuksaidso/api build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY --from=build /app/packages/agent-tools ./packages/agent-tools
COPY package.json pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY packages/agent-tools/package.json packages/agent-tools/package.json
WORKDIR /app/apps/api
USER node
CMD ["node", "dist/server.js"]

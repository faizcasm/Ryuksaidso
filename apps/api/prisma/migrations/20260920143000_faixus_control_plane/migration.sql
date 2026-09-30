CREATE TYPE "ProjectStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ARCHIVED');

CREATE TABLE "Project" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "status" "ProjectStatus" NOT NULL DEFAULT 'ACTIVE',
  "productionVersion" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Project_organizationId_slug_key" ON "Project"("organizationId","slug");
CREATE INDEX "Project_organizationId_status_idx" ON "Project"("organizationId","status");
ALTER TABLE "Project" ADD CONSTRAINT "Project_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Agent" ADD COLUMN "projectId" TEXT;
CREATE INDEX "Agent_organizationId_projectId_idx" ON "Agent"("organizationId","projectId");
ALTER TABLE "Agent" ADD CONSTRAINT "Agent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "AgentVersion" (
  "id" TEXT NOT NULL,
  "agentId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "config" JSONB NOT NULL,
  "changelog" TEXT,
  "createdBy" TEXT,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AgentVersion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AgentVersion_agentId_version_key" ON "AgentVersion"("agentId","version");
CREATE INDEX "AgentVersion_agentId_createdAt_idx" ON "AgentVersion"("agentId","createdAt");
ALTER TABLE "AgentVersion" ADD CONSTRAINT "AgentVersion_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AgentRun" ADD COLUMN "projectId" TEXT;
ALTER TABLE "AgentRun" ADD COLUMN "agentVersionId" TEXT;
ALTER TABLE "AgentRun" ADD COLUMN "trigger" TEXT NOT NULL DEFAULT 'playground';
ALTER TABLE "AgentRun" ADD COLUMN "environment" TEXT NOT NULL DEFAULT 'development';
ALTER TABLE "AgentRun" ADD COLUMN "latencyMs" INTEGER;
CREATE INDEX "AgentRun_organizationId_projectId_createdAt_idx" ON "AgentRun"("organizationId","projectId","createdAt");
CREATE INDEX "AgentRun_agentId_createdAt_idx" ON "AgentRun"("agentId","createdAt");
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_agentVersionId_fkey" FOREIGN KEY ("agentVersionId") REFERENCES "AgentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AgentStep" ADD COLUMN "tokens" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "Policy" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
  "severity" TEXT NOT NULL DEFAULT 'medium',
  "conditions" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Policy_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Policy_organizationId_name_key" ON "Policy"("organizationId","name");
CREATE INDEX "Policy_organizationId_enabled_idx" ON "Policy"("organizationId","enabled");
ALTER TABLE "Policy" ADD CONSTRAINT "Policy_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Evaluation" ADD COLUMN "projectId" TEXT;
ALTER TABLE "Evaluation" ADD COLUMN "agentId" TEXT;
CREATE INDEX "Evaluation_organizationId_createdAt_idx" ON "Evaluation"("organizationId","createdAt");
ALTER TABLE "Evaluation" ADD CONSTRAINT "Evaluation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Evaluation" ADD CONSTRAINT "Evaluation_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Upgrade existing workspaces created before the control-plane models existed.
INSERT INTO "Project" ("id","organizationId","name","slug","description","status","createdAt","updatedAt")
SELECT md5(random()::text || clock_timestamp()::text), o."id", 'Core Agent Platform', 'core-agent-platform', 'Production agent workspace for experiments, traces, evaluations and safe tool execution.', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Organization" o
WHERE NOT EXISTS (SELECT 1 FROM "Project" p WHERE p."organizationId" = o."id");

UPDATE "Agent" a
SET "projectId" = p."id"
FROM "Project" p
WHERE a."organizationId" = p."organizationId" AND a."projectId" IS NULL;

UPDATE "Agent"
SET "tools" = '["search_knowledge","get_ticket","add_ticket_message"]'::jsonb
WHERE "tools" IS NULL;

INSERT INTO "AgentVersion" ("id","agentId","version","config","changelog","publishedAt","createdAt")
SELECT md5(random()::text || clock_timestamp()::text), a."id", 1,
       jsonb_build_object('instructions',a."instructions",'tools',COALESCE(a."tools",'[]'::jsonb),'temperature',0.1),
       'Imported from pre-control-plane agent configuration', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Agent" a
WHERE NOT EXISTS (SELECT 1 FROM "AgentVersion" v WHERE v."agentId" = a."id");

INSERT INTO "Policy" ("id","organizationId","name","description","action","enabled","requiresApproval","severity","createdAt","updatedAt")
SELECT md5(random()::text || clock_timestamp()::text), o."id", 'Write operations require approval', 'Pause outbound or mutating tool calls until a human approves them.', 'ticket:write', true, true, 'high', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Organization" o
WHERE NOT EXISTS (SELECT 1 FROM "Policy" p WHERE p."organizationId" = o."id" AND p."name" = 'Write operations require approval');

INSERT INTO "Policy" ("id","organizationId","name","description","action","enabled","requiresApproval","severity","createdAt","updatedAt")
SELECT md5(random()::text || clock_timestamp()::text), o."id", 'Knowledge reads are always allowed', 'Allow organization-scoped retrieval without an approval round trip.', 'knowledge:read', true, false, 'low', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Organization" o
WHERE NOT EXISTS (SELECT 1 FROM "Policy" p WHERE p."organizationId" = o."id" AND p."name" = 'Knowledge reads are always allowed');

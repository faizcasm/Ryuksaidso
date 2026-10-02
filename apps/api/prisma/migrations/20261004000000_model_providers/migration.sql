ALTER TABLE "Organization" ALTER COLUMN "llmProvider" DROP DEFAULT;
ALTER TABLE "Organization" ALTER COLUMN "llmProvider" TYPE TEXT USING ("llmProvider"::text);
ALTER TABLE "Organization" ALTER COLUMN "llmProvider" SET DEFAULT 'OMNIROUTE';

ALTER TABLE "AgentRun" ALTER COLUMN "provider" DROP DEFAULT;
ALTER TABLE "AgentRun" ALTER COLUMN "provider" TYPE TEXT USING ("provider"::text);
ALTER TABLE "AgentRun" ALTER COLUMN "provider" SET DEFAULT 'OLLAMA';

DROP TYPE "LLMProvider";

CREATE TABLE "ModelProvider" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'openai_compat',
    "baseUrl" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL DEFAULT '',
    "defaultModel" TEXT NOT NULL DEFAULT '',
    "models" TEXT NOT NULL DEFAULT '[]',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "latencyMs" INTEGER,
    "lastCheckedAt" TIMESTAMP(3),
    "lastError" TEXT NOT NULL DEFAULT '',
    "connectedBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModelProvider_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ModelProvider_organizationId_idx" ON "ModelProvider"("organizationId");

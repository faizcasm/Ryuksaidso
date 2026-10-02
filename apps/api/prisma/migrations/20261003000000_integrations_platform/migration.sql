CREATE TYPE "ConnectionStatus" AS ENUM ('CONNECTED', 'DEGRADED', 'ERROR', 'EXPIRED', 'DISCONNECTED');

CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

CREATE TYPE "KnowledgeSourceStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ERROR');

CREATE TABLE "IntegrationSetting" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "disabledProviders" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updatedBy" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationSetting_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IntegrationConnection" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "status" "ConnectionStatus" NOT NULL DEFAULT 'CONNECTED',
    "authType" TEXT NOT NULL DEFAULT 'oauth2',
    "encryptedTokens" TEXT NOT NULL DEFAULT '',
    "profile" JSONB,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lastSyncAt" TIMESTAMP(3),
    "lastCheckedAt" TIMESTAMP(3),
    "lastError" TEXT NOT NULL DEFAULT '',
    "connectedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationConnection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IntegrationLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "connectionId" TEXT,
    "provider" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'info',
    "event" TEXT NOT NULL,
    "message" TEXT NOT NULL DEFAULT '',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "KnowledgeSource" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "remotePath" TEXT NOT NULL DEFAULT '',
    "status" "KnowledgeSourceStatus" NOT NULL DEFAULT 'ACTIVE',
    "autoSync" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT NOT NULL DEFAULT '',
    "documentsSynced" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeSource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WidgetSetting" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "agentId" TEXT,
    "title" TEXT NOT NULL DEFAULT 'Chat with us',
    "greeting" TEXT NOT NULL DEFAULT 'Hi! Ask me anything about our product.',
    "accent" TEXT NOT NULL DEFAULT '#8b5cf6',
    "allowedOrigins" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "collectEmail" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WidgetSetting_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WidgetSession" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "settingId" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "userAgent" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WidgetSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WidgetMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "runId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WidgetMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WebhookEndpoint" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "events" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastDeliveryAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookEndpoint_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WebhookDelivery" (
    "id" TEXT NOT NULL,
    "endpointId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "WebhookDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "IntegrationConnection_organizationId_status_idx" ON "IntegrationConnection"("organizationId", "status");

CREATE UNIQUE INDEX "IntegrationConnection_organizationId_provider_key" ON "IntegrationConnection"("organizationId", "provider");

CREATE INDEX "IntegrationLog_organizationId_createdAt_idx" ON "IntegrationLog"("organizationId", "createdAt");

CREATE INDEX "IntegrationLog_organizationId_provider_createdAt_idx" ON "IntegrationLog"("organizationId", "provider", "createdAt");

CREATE INDEX "KnowledgeSource_organizationId_provider_idx" ON "KnowledgeSource"("organizationId", "provider");

CREATE INDEX "KnowledgeSource_status_lastSyncAt_idx" ON "KnowledgeSource"("status", "lastSyncAt");

CREATE UNIQUE INDEX "WidgetSetting_organizationId_key" ON "WidgetSetting"("organizationId");

CREATE UNIQUE INDEX "WidgetSetting_publicKey_key" ON "WidgetSetting"("publicKey");

CREATE INDEX "WidgetSession_organizationId_createdAt_idx" ON "WidgetSession"("organizationId", "createdAt");

CREATE INDEX "WidgetSession_settingId_lastActiveAt_idx" ON "WidgetSession"("settingId", "lastActiveAt");

CREATE UNIQUE INDEX "WidgetMessage_runId_key" ON "WidgetMessage"("runId");

CREATE INDEX "WidgetMessage_sessionId_createdAt_idx" ON "WidgetMessage"("sessionId", "createdAt");

CREATE INDEX "WebhookEndpoint_organizationId_idx" ON "WebhookEndpoint"("organizationId");

CREATE INDEX "WebhookDelivery_organizationId_createdAt_idx" ON "WebhookDelivery"("organizationId", "createdAt");

CREATE INDEX "WebhookDelivery_endpointId_status_idx" ON "WebhookDelivery"("endpointId", "status");

CREATE UNIQUE INDEX "WebhookDelivery_endpointId_eventId_key" ON "WebhookDelivery"("endpointId", "eventId");

ALTER TABLE "WidgetMessage" ADD CONSTRAINT "WidgetMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WidgetSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "WebhookEndpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "Document" ADD COLUMN "agentId" TEXT;

CREATE INDEX "Document_organizationId_agentId_idx" ON "Document"("organizationId", "agentId");

ALTER TABLE "Document" ADD CONSTRAINT "Document_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

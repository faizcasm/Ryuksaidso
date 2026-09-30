-- Knowledge can be assigned to a specific agent. NULL keeps the document
-- shared with every agent in the workspace.
ALTER TABLE "Document" ADD COLUMN "agentId" TEXT;

-- CreateIndex
CREATE INDEX "Document_organizationId_agentId_idx" ON "Document"("organizationId", "agentId");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

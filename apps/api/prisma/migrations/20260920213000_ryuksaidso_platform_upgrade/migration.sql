CREATE TYPE "LLMProvider" AS ENUM ('OLLAMA', 'OMNIROUTE');

ALTER TABLE "Organization"
  ADD COLUMN "llmProvider" "LLMProvider" NOT NULL DEFAULT 'OLLAMA',
  ADD COLUMN "ollamaModel" TEXT NOT NULL DEFAULT 'qwen3:1.7b',
  ADD COLUMN "omnirouteModel" TEXT NOT NULL DEFAULT '';

ALTER TABLE "AgentRun"
  ADD COLUMN "provider" "LLMProvider" NOT NULL DEFAULT 'OLLAMA';

ALTER TABLE "User"
  ADD COLUMN "bio" TEXT,
  ADD COLUMN "jobTitle" TEXT,
  ADD COLUMN "avatarUrl" TEXT,
  ADD COLUMN "timezone" TEXT,
  ADD COLUMN "theme" TEXT NOT NULL DEFAULT 'system';

CREATE TABLE "PasswordResetToken" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");
CREATE INDEX "PasswordResetToken_userId_expiresAt_idx" ON "PasswordResetToken"("userId","expiresAt");
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

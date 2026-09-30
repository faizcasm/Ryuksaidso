ALTER TABLE "Organization"
  ALTER COLUMN "llmProvider" SET DEFAULT 'OMNIROUTE';

UPDATE "Organization"
   SET "llmProvider" = 'OMNIROUTE'
 WHERE "llmProvider" = 'OLLAMA';

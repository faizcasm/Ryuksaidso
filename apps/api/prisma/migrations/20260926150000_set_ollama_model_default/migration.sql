-- Model/provider configuration: the previous default (qwen3:1.7b) does not exist
-- in the local Ollama registry, and the worker reads Organization.ollamaModel at
-- execution time (packages/agent-runtime), so every run failed model resolution.
--
-- 1. New organizations get the model that is actually pulled locally.
ALTER TABLE "Organization"
  ALTER COLUMN "ollamaModel" SET DEFAULT 'qwen2.5-coder:3b-instruct-q4_K_M';

-- 2. Existing organizations that still point at the stale default are moved over.
--    Rows a user explicitly changed through PATCH /api/llm are preserved.
UPDATE "Organization"
   SET "ollamaModel" = 'qwen2.5-coder:3b-instruct-q4_K_M'
 WHERE "ollamaModel" = 'qwen3:1.7b';

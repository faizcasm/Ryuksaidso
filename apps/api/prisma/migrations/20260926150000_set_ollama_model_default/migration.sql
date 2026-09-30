ALTER TABLE "Organization"
  ALTER COLUMN "ollamaModel" SET DEFAULT 'qwen2.5-coder:3b-instruct-q4_K_M';

UPDATE "Organization"
   SET "ollamaModel" = 'qwen2.5-coder:3b-instruct-q4_K_M'
 WHERE "ollamaModel" = 'qwen3:1.7b';

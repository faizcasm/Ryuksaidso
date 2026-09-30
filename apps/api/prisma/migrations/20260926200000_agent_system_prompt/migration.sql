-- Optional custom system prompt per agent; when set, runs use it instead of instructions.
ALTER TABLE "Agent" ADD COLUMN "systemPrompt" TEXT;

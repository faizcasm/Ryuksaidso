process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://test:test@localhost:5432/test';
process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-that-is-at-least-32-characters-long';
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN ?? 'http://localhost:3000';
process.env.API_PORT = process.env.API_PORT ?? '4001';
process.env.RATE_LIMIT_MAX = process.env.RATE_LIMIT_MAX ?? '1000';
process.env.RATE_LIMIT_WINDOW_MS = process.env.RATE_LIMIT_WINDOW_MS ?? '60000';

process.env.FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:3000';
process.env.APP_NAME = process.env.APP_NAME ?? 'ryuksaidso';
process.env.OMNIROUTE_URL = process.env.OMNIROUTE_URL ?? 'http://localhost:20128/v1';
process.env.OMNIROUTE_API = process.env.OMNIROUTE_API ?? 'test-key';
process.env.OMNIROUTE_MODEL = process.env.OMNIROUTE_MODEL ?? 'test-model';
process.env.OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434/v1';
process.env.OLLAMA_API = process.env.OLLAMA_API ?? 'ollama';
process.env.OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? 'test-model';
process.env.DOCKER_RUNTIME = process.env.DOCKER_RUNTIME ?? 'false';

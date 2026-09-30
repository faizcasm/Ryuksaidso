import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';
import { config } from './lib/config';
import { logger } from './lib/logger';
import { metricsRegistry, httpDuration, httpRequests } from './lib/metrics';
import { prisma } from './lib/db';
import { redis } from './lib/redis';
import { getLLMProvider, isModelAvailable } from './services/llm';
import { verifyEmailTransport } from './services/email';
import { authRouter } from './routes/auth';
import { appRouter } from './routes/app';
import { approvalRouter } from './routes/approvals';
import { evaluationRouter } from './routes/evaluations';
import { controlRouter } from './routes/control';
import { accountRouter } from './routes/account';
import { adminRouter } from './routes/admin';
import { docsRouter } from './routes/docs';
import { requestId, csrfProtection } from './middleware';
import { errorHandler, notFoundHandler } from './middleware-error';

function bounded<T>(fn: () => Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
    fn().then(
      value => { clearTimeout(timer); resolve(value); },
      error => { clearTimeout(timer); reject(error); },
    );
  });
}

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(requestId);
  app.use(helmet());
  app.use(cors({ origin: config.CORS_ORIGIN.split(',').map((x) => x.trim()), credentials: true }));
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));

  app.use(morgan('combined', {
    stream: { write: (line: string) => logger.http(line.trim()) }
  }));

  const limiter = rateLimit({
    windowMs: config.RATE_LIMIT_WINDOW_MS,
    limit: config.RATE_LIMIT_MAX,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'RateLimitExceeded', message: 'Too many requests, please try again later.' }
  });
  app.use('/api', limiter);

  app.use((req, res, next) => {
    const started = process.hrtime.bigint();
    res.on('finish', () => {
      const seconds = Number(process.hrtime.bigint() - started) / 1e9;
      const route = req.route?.path ? `${req.baseUrl}${req.route.path}` : req.path;
      const labels = { method: req.method, route, status: String(res.statusCode) };
      httpDuration.observe(labels, seconds);
      httpRequests.inc(labels);
    });
    next();
  });

  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'ryuksaidso-api', time: new Date().toISOString() }));

  app.get('/ready', async (_req, res, next) => {
    try {
      await bounded(() => prisma.$queryRaw`SELECT 1`, 2000);
      await bounded(() => redis.ping(), 2000);
      const checks = await Promise.all((['OLLAMA','OMNIROUTE'] as const).map(async provider => {
        const model = provider === 'OLLAMA' ? config.OLLAMA_MODEL : config.OMNIROUTE_MODEL;
        if (!model && provider === 'OMNIROUTE') return { provider, ok: false, reason: 'model not configured' };
        try {
          const models = await getLLMProvider(provider, model || undefined).models();
          if (model && models.length && !isModelAvailable(models, model)) return { provider, ok: false, reason: `model ${model} unavailable` };
          return { provider, ok: true, model: model || null };
        } catch (error) {
          return { provider, ok: false, reason: error instanceof Error ? error.message : String(error) };
        }
      }));
      const healthy = checks.filter(x => x.ok);
      if (!healthy.length) throw new Error('No configured LLM provider is reachable');
      res.json({ status: 'ready', dependencies: { postgres: 'ok', redis: 'ok', llm: healthy }, providers: checks });
    } catch (error) {
      next(Object.assign(new Error('Service dependencies are not ready'), { statusCode: 503, cause: error }));
    }
  });

  app.get('/metrics', async (_req, res) => {
    res.type('text/plain; version=0.0.4');
    res.send(await metricsRegistry.metrics());
  });

  app.use('/api', csrfProtection);
  app.use('/api/auth', authRouter);
  app.use('/api/control', controlRouter);
  app.use('/api', appRouter);
  app.use('/api', accountRouter);
  app.use('/api', approvalRouter);
  app.use('/api', evaluationRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api', docsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

if (require.main === module) {
  const app = createApp();
  const server = app.listen(config.API_PORT, '0.0.0.0', () => {
    logger.info(`Ryuksaidso API listening on port ${config.API_PORT}`);
    void verifyEmailTransport();
  });

  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down`);
    server.close(async () => {
      await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
      process.exit(0);
    });
  };

  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));
}

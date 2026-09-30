import Redis from 'ioredis';
import { config } from './config';
import { logger } from './logger';

export const redis = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  lazyConnect: true,
  enableOfflineQueue: true,
  commandTimeout: 10_000
});

redis.on('error', error => {
  logger.warn('Redis connection error', { error: error.message });
});

import winston from 'winston';
import { config } from './config';

const transports: winston.transport[] = [
  new winston.transports.Console()
];

export const logger = winston.createLogger({
  level: config.LOG_LEVEL,
  format: winston.format.combine(
    winston.format.timestamp(),
    config.NODE_ENV === 'development' ? winston.format.colorize() : winston.format.json()
  ),
  transports,
  defaultMeta: { service: 'ryuksaidso-api' }
});

import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { logger } from './lib/logger';

export const notFoundHandler = (req: import('express').Request, res: import('express').Response) => {
  res.status(404).json({ error: 'NotFound', message: `Route ${req.method} ${req.path} not found` });
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof ZodError) {
    const detail = err.issues
      .map(i => `${i.path.length ? i.path.join('.') : 'body'}: ${i.message}`)
      .join('; ');
    res.status(400).json({ error: 'ValidationError', message: detail || 'Request validation failed', issues: err.issues });
    return;
  }

  const status = Number(err?.statusCode ?? err?.status ?? 500);
  const safeStatus = status >= 400 && status < 600 ? status : 500;
  const requestId = req.header('x-request-id');

  logger.error('Unhandled request error', {
    requestId,
    method: req.method,
    path: req.path,
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined
  });

  res.status(safeStatus).json({
    error: safeStatus === 500 ? 'InternalServerError' : 'RequestError',
    message: safeStatus === 500 ? 'Internal server error' : (err instanceof Error ? err.message : 'Request failed'),
    requestId
  });
};

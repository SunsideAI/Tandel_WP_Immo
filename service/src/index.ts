import express from 'express';
import pinoHttp from 'pino-http';
import { getConfig } from './config';
import { logger } from './utils/logger';
import { webhookRouter } from './routes/webhook';
import { healthRouter } from './routes/health';
import { syncRouter } from './routes/sync';

const config = getConfig();

const app = express();

app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/health' } }));

// Health + status use JSON body parsing (no body expected, but safe default).
app.use('/', healthRouter);

// Webhook route mounts its own raw body parser internally.
app.use('/webhook', webhookRouter);

// /sync/full and /sync/one/:id use JSON body parsing.
app.use('/sync', express.json({ limit: '256kb' }), syncRouter);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({ err }, 'Unhandled error');
  res.status(500).json({ error: 'internal_error' });
});

const server = app.listen(config.PORT, () => {
  logger.info(
    { port: config.PORT, env: config.NODE_ENV, dry_run: config.DRY_RUN },
    'tandel-propstack-sync started',
  );
});

function shutdown(signal: string): void {
  logger.info({ signal }, 'Shutting down');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

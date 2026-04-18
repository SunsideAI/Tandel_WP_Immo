import pino from 'pino';
import { getConfig } from '../config';

const config = getConfig();

export const logger = pino({
  level: config.LOG_LEVEL,
  base: { service: 'tandel-propstack-sync' },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers["x-tandel-api-key"]',
      'req.headers["x-propstack-signature"]',
      '*.PROPSTACK_API_KEY',
      '*.WP_BRIDGE_API_KEY',
    ],
    censor: '[REDACTED]',
  },
});

export type Logger = typeof logger;

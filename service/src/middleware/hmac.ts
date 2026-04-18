import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { getConfig } from '../config';
import { logger } from '../utils/logger';

const config = getConfig();

/**
 * Extend Express Request to carry the raw body captured by express.raw().
 */
declare module 'express-serve-static-core' {
  interface Request {
    rawBody?: Buffer;
  }
}

function timingSafeCompare(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

export function verifyHmac(body: Buffer, signature: string, secret: string): boolean {
  const hash = crypto.createHmac('sha256', secret).update(body).digest('hex');
  return timingSafeCompare(hash, signature);
}

/**
 * Soft HMAC check:
 *   - No signature header -> log warning, let the request through.
 *   - Signature present but invalid -> reject with 401.
 *   - Signature present and valid -> pass through.
 */
export function propstackHmac(req: Request, res: Response, next: NextFunction): void {
  const signature = req.header('X-Propstack-Signature');
  const body = req.rawBody;

  if (!body) {
    logger.error('rawBody missing - is express.raw() configured on this route?');
    res.status(500).json({ error: 'Raw body not captured' });
    return;
  }

  if (!signature) {
    logger.warn('No HMAC signature - allowing (soft-check)');
    next();
    return;
  }

  if (!verifyHmac(body, signature, config.PROPSTACK_WEBHOOK_SECRET)) {
    logger.warn({ signature }, 'HMAC mismatch - rejecting');
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  next();
}

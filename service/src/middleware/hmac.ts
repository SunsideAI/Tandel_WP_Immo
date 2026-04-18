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
 * Soft HMAC check: in non-enforce mode, mismatches are logged as warnings
 * but the request still proceeds. Flip HMAC_ENFORCE=true once Propstack's
 * real signature format is confirmed in production logs.
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
    if (config.HMAC_ENFORCE) {
      logger.warn('HMAC signature missing, rejecting');
      res.status(401).json({ error: 'Missing signature' });
      return;
    }
    logger.warn('HMAC signature missing - proceeding (soft mode)');
    next();
    return;
  }

  const valid = verifyHmac(body, signature, config.PROPSTACK_WEBHOOK_SECRET);

  if (!valid) {
    if (config.HMAC_ENFORCE) {
      logger.warn({ signature }, 'HMAC mismatch - rejecting');
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }
    logger.warn({ signature }, 'HMAC mismatch - proceeding (soft mode)');
  }

  next();
}

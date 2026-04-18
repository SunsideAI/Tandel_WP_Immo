import { Router, type Request, type Response } from 'express';
import express from 'express';
import { propstackHmac } from '../middleware/hmac';
import { handleWebhook } from '../services/sync';
import { logger } from '../utils/logger';
import type { PropstackWebhookPayload } from '../types/propstack';

export const webhookRouter = Router();

/**
 * Capture raw body for HMAC before JSON parsing.
 * Note: express.raw() must run before propstackHmac on this route.
 */
webhookRouter.post(
  '/propstack',
  express.raw({ type: 'application/json', limit: '1mb' }),
  (req, _res, next) => {
    req.rawBody = req.body as Buffer;
    try {
      req.body = JSON.parse((req.body as Buffer).toString('utf8'));
    } catch (err) {
      logger.warn({ err }, 'Invalid JSON in webhook body');
      req.body = {};
    }
    next();
  },
  propstackHmac,
  (req: Request, res: Response) => {
    const payload = req.body as Partial<PropstackWebhookPayload>;
    const propstackId = payload.data?.id;
    const event = payload.event;

    if (!propstackId || !event) {
      logger.warn({ payload }, 'Webhook missing required fields');
      res.status(400).json({ error: 'Missing event or data.id' });
      return;
    }

    // Respond immediately - Propstack waits ~10s before considering the delivery failed.
    res.status(202).json({ status: 'accepted', propstack_id: propstackId });

    // Fire-and-forget processing. Failures are logged and recorded to sync_log.
    handleWebhook(event, propstackId).catch((err) => {
      logger.error({ err, propstack_id: propstackId }, 'Async webhook processing error');
    });
  },
);

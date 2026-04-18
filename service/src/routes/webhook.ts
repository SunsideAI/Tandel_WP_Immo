import { Router, type Request, type Response } from 'express';
import express from 'express';
import { propstackHmac } from '../middleware/hmac';
import { handleWebhook } from '../services/sync';
import { logger } from '../utils/logger';

export const webhookRouter = Router();

/**
 * Propstack webhook body shape:
 *   - Property data is at the ROOT (no `data` wrapper).
 *   - No `event` field - the event type is inferred from the webhook registration.
 *   - `changed_attributes` is a comma-separated string (not an array), also at root.
 *
 * We only need `id` here; the full unit is refetched via Propstack API during sync.
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
    const body = req.body as { id?: number; changed_attributes?: string } | undefined;
    const propstackId = body?.id;

    // Propstack sendet kein event-Feld im Body.
    // Wir wissen aus der Webhook-Registrierung, dass es ein Update ist.
    const event = 'property_updated';

    if (!propstackId || typeof propstackId !== 'number') {
      logger.warn({ body }, 'Webhook missing id at root');
      res.status(400).json({ error: 'Missing id in webhook body' });
      return;
    }

    const changed = body?.changed_attributes?.split(',').map((s) => s.trim()).filter(Boolean);
    logger.info({ propstack_id: propstackId, changed }, 'Webhook received');

    // Respond immediately - Propstack waits ~10s before considering the delivery failed.
    res.status(202).json({ status: 'accepted', propstack_id: propstackId });

    // Fire-and-forget processing.
    handleWebhook(event, propstackId).catch((err) => {
      logger.error({ err, propstack_id: propstackId }, 'Async webhook processing error');
    });
  },
);

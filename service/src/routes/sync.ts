import { Router, type Request, type Response, type NextFunction } from 'express';
import { getConfig } from '../config';
import { logger } from '../utils/logger';
import { iterateAllUnits } from '../services/propstack';
import { syncProperty } from '../services/sync';

const config = getConfig();
export const syncRouter = Router();

function requireAdminKey(req: Request, res: Response, next: NextFunction): void {
  if (!config.SYNC_FULL_API_KEY) {
    res.status(503).json({ error: 'SYNC_FULL_API_KEY not configured' });
    return;
  }
  const key = req.header('X-Admin-Key');
  if (key !== config.SYNC_FULL_API_KEY) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

syncRouter.post('/full', requireAdminKey, (_req, res) => {
  // Respond immediately, run full sync in background.
  res.status(202).json({ status: 'started' });

  void (async () => {
    let count = 0;
    let errors = 0;
    logger.info('Full sync started');
    try {
      for await (const unit of iterateAllUnits()) {
        try {
          await syncProperty(unit.id);
          count++;
        } catch (err) {
          errors++;
          logger.error({ err, propstack_id: unit.id }, 'Full sync item failed');
        }
      }
    } catch (err) {
      logger.error({ err }, 'Full sync iteration failed');
    }
    logger.info({ count, errors }, 'Full sync finished');
  })();
});

syncRouter.post('/one/:id', requireAdminKey, async (req, res) => {
  const id = Number.parseInt(req.params.id ?? '', 10);
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }

  try {
    await syncProperty(id);
    res.json({ status: 'ok', propstack_id: id });
  } catch (err) {
    logger.error({ err, propstack_id: id }, 'Manual sync failed');
    res.status(500).json({
      error: 'sync_failed',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

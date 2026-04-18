import { Router } from 'express';
import { getStats } from '../services/stats';

export const healthRouter = Router();

const bootTime = Date.now();

healthRouter.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    uptime_seconds: Math.floor((Date.now() - bootTime) / 1000),
  });
});

healthRouter.get('/status', (_req, res) => {
  res.json(getStats());
});

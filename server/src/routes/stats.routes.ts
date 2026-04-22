import { Router, Request, Response } from 'express';
import { auth } from '../middleware/auth.js';
import { role } from '../middleware/role.js';
import * as statsService from '../services/stats.service.js';

const router = Router();

router.get('/', auth, role(['kueche_schank', 'admin']), (req: Request, res: Response) => {
  const from = (req.query.from as string) || null;
  const to = (req.query.to as string) || null;
  const limit = req.query.limit ? Math.max(1, Math.min(50, parseInt(req.query.limit as string))) : 10;
  res.json(statsService.getStatsBundle({ from, to }, limit));
});

export default router;

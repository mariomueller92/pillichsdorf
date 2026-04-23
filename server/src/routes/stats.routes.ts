import { Router, Request, Response, NextFunction } from 'express';
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

// Admin-only: Statistik zurücksetzen (alle Rechnungen, Bestellungen, Positionen löschen)
router.post('/reset', auth, role(['admin']), (req: Request, res: Response, next: NextFunction) => {
  try {
    const confirm = req.body?.confirm;
    if (confirm !== 'RESET') {
      return res.status(400).json({ error: 'Bestätigung fehlt. Body muss { "confirm": "RESET" } enthalten.' });
    }
    const result = statsService.resetAll();
    res.json({ ok: true, ...result });
  } catch (err) { next(err); }
});

export default router;

import { Router, Request, Response, NextFunction } from 'express';
import { auth } from '../middleware/auth.js';
import { role } from '../middleware/role.js';
import { printAgentAuth } from '../middleware/printAgentAuth.js';
import * as printJobsService from '../services/printJobs.service.js';
import * as settingsService from '../services/settings.service.js';
import { config } from '../config.js';

const router = Router();

// Vom lokalen Print-Agent gepollt (Maschinen-Auth, kein User-JWT).
router.get('/pending', printAgentAuth, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const [jobs, settings] = await Promise.all([
      printJobsService.listPending(),
      settingsService.getSettings(),
    ]);
    res.json({
      jobs,
      printerName: settings.printer_name,
      printerEnabled: config.printer.enabled,
    });
  } catch (err) { next(err); }
});

router.post('/:id/complete', printAgentAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await printJobsService.markDone(parseInt(req.params.id));
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.post('/:id/fail', printAgentAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await printJobsService.markFailed(parseInt(req.params.id), req.body?.error || 'Unbekannter Fehler');
    res.json({ success: true });
  } catch (err) { next(err); }
});

// Vom Client gepollt (ersetzt den frueheren "printer:error"-Socket-Push).
router.get('/failed-recent', auth, role(['admin', 'kellner', 'kueche_schank', 'schank_kellner', 'kassa_spk']), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await printJobsService.listRecentFailed());
  } catch (err) { next(err); }
});

export default router;

import { Router, Request, Response, NextFunction } from 'express';
import { auth } from '../middleware/auth.js';
import { role } from '../middleware/role.js';
import { validate } from '../middleware/validate.js';
import { updateSettingsSchema } from '../shared/schemas.js';
import * as settingsService from '../services/settings.service.js';

const router = Router();

// Oeffentlich (kein auth): Login-Seite und Kellner-App brauchen Firmenname/Branding
// bereits vor bzw. unabhaengig von der Anmeldung.
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await settingsService.getSettings());
  } catch (err) { next(err); }
});

router.put('/', auth, role(['admin']), validate(updateSettingsSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Drucker-Name/-Breite werden vom Print-Agent bei jedem Poll frisch aus den
    // Settings gelesen (siehe /api/print-jobs/pending) - kein Server-seitiges Wiring noetig.
    const settings = await settingsService.updateSettings(req.body);
    res.json(settings);
  } catch (err) { next(err); }
});

export default router;

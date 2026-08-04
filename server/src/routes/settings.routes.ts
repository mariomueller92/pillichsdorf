import { Router, Request, Response, NextFunction } from 'express';
import { auth } from '../middleware/auth.js';
import { role } from '../middleware/role.js';
import { validate } from '../middleware/validate.js';
import { updateSettingsSchema } from '../shared/schemas.js';
import * as settingsService from '../services/settings.service.js';
import { applySettingsToPrinter } from '../printer/index.js';

const router = Router();

// Oeffentlich (kein auth): Login-Seite und Kellner-App brauchen Firmenname/Branding
// bereits vor bzw. unabhaengig von der Anmeldung.
router.get('/', (_req: Request, res: Response) => {
  res.json(settingsService.getSettings());
});

router.put('/', auth, role(['admin']), validate(updateSettingsSchema), (req: Request, res: Response, next: NextFunction) => {
  try {
    const settings = settingsService.updateSettings(req.body);
    applySettingsToPrinter(settings.printer_name, settings.printer_width);
    res.json(settings);
  } catch (err) { next(err); }
});

export default router;

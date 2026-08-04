import { Router, Request, Response, NextFunction } from 'express';
import { auth } from '../middleware/auth.js';
import { role } from '../middleware/role.js';
import { validate } from '../middleware/validate.js';
import { createJetonTypeSchema, updateJetonTypeSchema } from '../shared/schemas.js';
import * as jetonTypesService from '../services/jetonTypes.service.js';

const router = Router();

router.get('/', auth, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await jetonTypesService.listJetonTypes());
  } catch (err) { next(err); }
});

router.post('/', auth, role(['admin']), validate(createJetonTypeSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const jt = await jetonTypesService.createJetonType(req.body);
    res.status(201).json(jt);
  } catch (err) { next(err); }
});

router.put('/:id', auth, role(['admin']), validate(updateJetonTypeSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const jt = await jetonTypesService.updateJetonType(parseInt(req.params.id), req.body);
    res.json(jt);
  } catch (err) { next(err); }
});

router.delete('/:id', auth, role(['admin']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await jetonTypesService.deleteJetonType(parseInt(req.params.id));
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;

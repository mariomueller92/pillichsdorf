import { Router, Request, Response, NextFunction } from 'express';
import { auth } from '../middleware/auth.js';
import { role } from '../middleware/role.js';
import { validate } from '../middleware/validate.js';
import { createCategorySchema, updateCategorySchema, createMenuItemSchema, updateMenuItemSchema } from '../shared/schemas.js';
import * as menuService from '../services/menu.service.js';

const router = Router();

// Categories
router.get('/categories', auth, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await menuService.listCategories());
  } catch (err) { next(err); }
});

router.post('/categories', auth, role(['admin']), validate(createCategorySchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const cat = await menuService.createCategory(req.body);
    res.status(201).json(cat);
  } catch (err) { next(err); }
});

router.put('/categories/:id', auth, role(['admin']), validate(updateCategorySchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const cat = await menuService.updateCategory(parseInt(req.params.id), req.body);
    res.json(cat);
  } catch (err) { next(err); }
});

router.delete('/categories/:id', auth, role(['admin']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await menuService.deleteCategory(parseInt(req.params.id));
    res.json({ success: true });
  } catch (err) { next(err); }
});

// Items
router.get('/items', auth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const categoryId = req.query.category_id ? parseInt(req.query.category_id as string) : undefined;
    res.json(await menuService.listItems(categoryId));
  } catch (err) { next(err); }
});

router.get('/items/:id', auth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await menuService.getItem(parseInt(req.params.id)));
  } catch (err) { next(err); }
});

router.post('/items', auth, role(['admin']), validate(createMenuItemSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const item = await menuService.createItem(req.body);
    res.status(201).json(item);
  } catch (err) { next(err); }
});

router.put('/items/:id', auth, role(['admin']), validate(updateMenuItemSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const item = await menuService.updateItem(parseInt(req.params.id), req.body);
    res.json(item);
  } catch (err) { next(err); }
});

router.delete('/items/:id', auth, role(['admin']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await menuService.deleteItem(parseInt(req.params.id));
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.patch('/items/:id/availability', auth, role(['admin', 'kellner']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const item = await menuService.toggleAvailability(parseInt(req.params.id));
    res.json(item);
  } catch (err) { next(err); }
});

router.patch('/items/:id/mode', auth, role(['kueche_schank', 'admin']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const item = await menuService.toggleAvailabilityMode(parseInt(req.params.id));
    res.json(item);
  } catch (err) { next(err); }
});

export default router;

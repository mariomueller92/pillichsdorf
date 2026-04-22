import { Router, Request, Response, NextFunction } from 'express';
import { auth } from '../middleware/auth.js';
import { role } from '../middleware/role.js';
import { validate } from '../middleware/validate.js';
import { createCategorySchema, updateCategorySchema, createMenuItemSchema, updateMenuItemSchema } from '../shared/schemas.js';
import * as menuService from '../services/menu.service.js';
import * as socketService from '../services/socket.service.js';

const router = Router();

// Categories
router.get('/categories', auth, (_req: Request, res: Response) => {
  res.json(menuService.listCategories());
});

router.post('/categories', auth, role(['admin']), validate(createCategorySchema), (req: Request, res: Response, next: NextFunction) => {
  try {
    const cat = menuService.createCategory(req.body);
    res.status(201).json(cat);
  } catch (err) { next(err); }
});

router.put('/categories/:id', auth, role(['admin']), validate(updateCategorySchema), (req: Request, res: Response, next: NextFunction) => {
  try {
    const cat = menuService.updateCategory(parseInt(req.params.id), req.body);
    res.json(cat);
  } catch (err) { next(err); }
});

router.delete('/categories/:id', auth, role(['admin']), (req: Request, res: Response, next: NextFunction) => {
  try {
    menuService.deleteCategory(parseInt(req.params.id));
    res.json({ success: true });
  } catch (err) { next(err); }
});

// Items
router.get('/items', auth, (req: Request, res: Response) => {
  const categoryId = req.query.category_id ? parseInt(req.query.category_id as string) : undefined;
  res.json(menuService.listItems(categoryId));
});

router.get('/items/:id', auth, (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(menuService.getItem(parseInt(req.params.id)));
  } catch (err) { next(err); }
});

router.post('/items', auth, role(['admin']), validate(createMenuItemSchema), (req: Request, res: Response, next: NextFunction) => {
  try {
    const item = menuService.createItem(req.body);
    res.status(201).json(item);
  } catch (err) { next(err); }
});

router.put('/items/:id', auth, role(['admin']), validate(updateMenuItemSchema), (req: Request, res: Response, next: NextFunction) => {
  try {
    const item = menuService.updateItem(parseInt(req.params.id), req.body);
    res.json(item);
  } catch (err) { next(err); }
});

router.delete('/items/:id', auth, role(['admin']), (req: Request, res: Response, next: NextFunction) => {
  try {
    menuService.deleteItem(parseInt(req.params.id));
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.patch('/items/:id/availability', auth, role(['admin', 'kellner']), (req: Request, res: Response, next: NextFunction) => {
  try {
    const item = menuService.toggleAvailability(parseInt(req.params.id));
    res.json(item);
  } catch (err) { next(err); }
});

router.patch('/items/:id/mode', auth, role(['kueche_schank', 'admin']), (req: Request, res: Response, next: NextFunction) => {
  try {
    const item = menuService.toggleAvailabilityMode(parseInt(req.params.id));
    socketService.emitProductAvailabilityChanged(item);
    res.json(item);
  } catch (err) { next(err); }
});

export default router;

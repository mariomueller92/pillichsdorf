import { Router, Request, Response, NextFunction } from 'express';
import { auth } from '../middleware/auth.js';
import { role } from '../middleware/role.js';
import { validate } from '../middleware/validate.js';
import { createOrderSchema, addOrderItemsSchema, acknowledgeSchema, transferOrderSchema } from '../shared/schemas.js';
import * as ordersService from '../services/orders.service.js';

const router = Router();

router.get('/', auth, (req: Request, res: Response) => {
  const filters = {
    table_id: req.query.table_id ? parseInt(req.query.table_id as string) : undefined,
    status: req.query.status as string | undefined,
    waiter_id: req.query.waiter_id ? parseInt(req.query.waiter_id as string) : undefined,
  };
  res.json(ordersService.listOrders(filters));
});

router.get('/active', auth, (req: Request, res: Response) => {
  const target = req.query.target as 'kueche' | 'schank' | undefined;
  res.json(ordersService.getActiveOrders(target));
});

router.get('/pending-kitchen', auth, (_req: Request, res: Response) => {
  res.json(ordersService.getPendingKitchenItems());
});

router.get('/admin/all', auth, role(['admin']), (req: Request, res: Response) => {
  const from = req.query.from as string | undefined;
  const to = req.query.to as string | undefined;
  res.json(ordersService.listAllOrdersWithItems({ from, to }));
});

router.get('/top-items', auth, (req: Request, res: Response) => {
  const limit = req.query.limit ? Math.max(1, Math.min(50, parseInt(req.query.limit as string))) : 10;
  res.json(ordersService.getTopItems(limit));
});

router.get('/:id', auth, (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(ordersService.getOrder(parseInt(req.params.id)));
  } catch (err) { next(err); }
});

router.post('/', auth, role(['admin', 'kellner']), validate(createOrderSchema), (req: Request, res: Response, next: NextFunction) => {
  try {
    const order = ordersService.createOrder({
      ...req.body,
      waiter_id: req.user!.userId,
    });
    res.status(201).json(order);
  } catch (err) { next(err); }
});

router.post('/:id/items', auth, role(['admin', 'kellner']), validate(addOrderItemsSchema), (req: Request, res: Response, next: NextFunction) => {
  try {
    const order = ordersService.addItems(parseInt(req.params.id), req.body.items);
    res.json(order);
  } catch (err) { next(err); }
});

router.post('/:id/acknowledge', auth, role(['kueche_schank', 'admin']), validate(acknowledgeSchema), (req: Request, res: Response, next: NextFunction) => {
  try {
    const order = ordersService.acknowledgeItems(
      parseInt(req.params.id),
      req.body.item_ids,
      req.body.status,
      req.user!.userId,
    );
    res.json(order);
  } catch (err) { next(err); }
});

router.patch('/:id/items/:itemId', auth, (req: Request, res: Response, next: NextFunction) => {
  try {
    const order = ordersService.updateItemStatus(
      parseInt(req.params.id),
      parseInt(req.params.itemId),
      req.body.status,
    );
    res.json(order);
  } catch (err) { next(err); }
});

router.delete('/:id', auth, role(['admin', 'kellner']), (req: Request, res: Response, next: NextFunction) => {
  try {
    const order = ordersService.cancelOrder(parseInt(req.params.id));
    res.json(order);
  } catch (err) { next(err); }
});

router.post('/:id/transfer', auth, role(['admin', 'kellner']), validate(transferOrderSchema), (req: Request, res: Response, next: NextFunction) => {
  try {
    const order = ordersService.transferOrder(parseInt(req.params.id), req.body.target_table_id);
    res.json(order);
  } catch (err) { next(err); }
});

router.post('/:id/move-to-table', auth, role(['kellner', 'admin']), validate(transferOrderSchema), (req: Request, res: Response, next: NextFunction) => {
  try {
    const order = ordersService.moveBarToTable(parseInt(req.params.id), req.body.target_table_id);
    res.json(order);
  } catch (err) { next(err); }
});

export default router;

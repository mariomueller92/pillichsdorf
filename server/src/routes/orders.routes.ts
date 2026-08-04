import { Router, Request, Response, NextFunction } from 'express';
import { auth } from '../middleware/auth.js';
import { role } from '../middleware/role.js';
import { validate } from '../middleware/validate.js';
import { AppError } from '../middleware/errorHandler.js';
import { createOrderSchema, addOrderItemsSchema, acknowledgeSchema, transferOrderSchema } from '../shared/schemas.js';
import * as ordersService from '../services/orders.service.js';

const router = Router();

router.get('/', auth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Kassa-SPK darf ausschliesslich die eigene Bestellhistorie sehen - Filter erzwingen,
    // unabhaengig vom uebergebenen waiter_id-Query-Param.
    const waiterId = req.user!.role === 'kassa_spk'
      ? req.user!.userId
      : (req.query.waiter_id ? parseInt(req.query.waiter_id as string) : undefined);
    const filters = {
      table_id: req.query.table_id ? parseInt(req.query.table_id as string) : undefined,
      status: req.query.status as string | undefined,
      waiter_id: waiterId,
    };
    res.json(await ordersService.listOrders(filters));
  } catch (err) { next(err); }
});

router.get('/active', auth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const target = req.query.target as 'kueche' | 'schank' | undefined;
    res.json(await ordersService.getActiveOrders(target));
  } catch (err) { next(err); }
});

router.get('/pending-kitchen', auth, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await ordersService.getPendingKitchenItems());
  } catch (err) { next(err); }
});

router.get('/admin/all', auth, role(['admin']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;
    res.json(await ordersService.listAllOrdersWithItems({ from, to }));
  } catch (err) { next(err); }
});

router.get('/top-items', auth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = req.query.limit ? Math.max(1, Math.min(50, parseInt(req.query.limit as string))) : 10;
    res.json(await ordersService.getTopItems(limit));
  } catch (err) { next(err); }
});

router.get('/:id', auth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await ordersService.getOrder(parseInt(req.params.id)));
  } catch (err) { next(err); }
});

router.post('/', auth, role(['admin', 'kellner', 'schank_kellner', 'kassa_spk']), validate(createOrderSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Schank-Kellner und Kassa-SPK legen nie Tisch-Bestellungen an - unabhängig vom Body erzwingen
    const tableId = (req.user!.role === 'schank_kellner' || req.user!.role === 'kassa_spk') ? null : req.body.table_id;
    const order = await ordersService.createOrder({
      ...req.body,
      table_id: tableId,
      waiter_id: req.user!.userId,
    });
    res.status(201).json(order);
  } catch (err) { next(err); }
});

router.post('/:id/items', auth, role(['admin', 'kellner']), validate(addOrderItemsSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const order = await ordersService.addItems(parseInt(req.params.id), req.body.items);
    res.json(order);
  } catch (err) { next(err); }
});

router.post('/:id/acknowledge', auth, role(['kueche_schank', 'admin']), validate(acknowledgeSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const order = await ordersService.acknowledgeItems(
      parseInt(req.params.id),
      req.body.item_ids,
      req.body.status,
      req.user!.userId,
    );
    res.json(order);
  } catch (err) { next(err); }
});

router.patch('/:id/items/:itemId', auth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const order = await ordersService.updateItemStatus(
      parseInt(req.params.id),
      parseInt(req.params.itemId),
      req.body.status,
    );
    res.json(order);
  } catch (err) { next(err); }
});

router.post('/:id/reprint-bon', auth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await ordersService.reprintOrderBon(parseInt(req.params.id)));
  } catch (err) { next(err); }
});

router.delete('/:id', auth, role(['admin', 'kellner', 'kassa_spk']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orderId = parseInt(req.params.id);
    // Kassa-SPK darf nur eigene Bestellungen stornieren
    if (req.user!.role === 'kassa_spk') {
      const existing = await ordersService.getOrder(orderId);
      if (existing.waiter_id !== req.user!.userId) {
        return next(new AppError(403, 'Keine Berechtigung'));
      }
    }
    const order = await ordersService.cancelOrder(orderId);
    res.json(order);
  } catch (err) { next(err); }
});

router.post('/:id/transfer', auth, role(['admin', 'kellner']), validate(transferOrderSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const order = await ordersService.transferOrder(parseInt(req.params.id), req.body.target_table_id);
    res.json(order);
  } catch (err) { next(err); }
});

router.post('/:id/move-to-table', auth, role(['kellner', 'admin']), validate(transferOrderSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const order = await ordersService.moveBarToTable(parseInt(req.params.id), req.body.target_table_id);
    res.json(order);
  } catch (err) { next(err); }
});

export default router;

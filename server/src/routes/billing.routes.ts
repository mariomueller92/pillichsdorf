import { Router, Request, Response, NextFunction } from 'express';
import { auth } from '../middleware/auth.js';
import { role } from '../middleware/role.js';
import { validate } from '../middleware/validate.js';
import { settleTableSchema, settleItemsSchema } from '../shared/schemas.js';
import * as billingService from '../services/billing.service.js';

const router = Router();

router.get('/table/:tableId/summary', auth, role(['admin', 'kellner']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await billingService.getTableSummary(parseInt(req.params.tableId)));
  } catch (err) { next(err); }
});

router.post('/table/:tableId/settle', auth, role(['admin', 'kellner']), validate(settleTableSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const bill = await billingService.settleTable(parseInt(req.params.tableId), req.user!.userId, req.body);
    res.json(bill);
  } catch (err) { next(err); }
});

router.post('/table/:tableId/print-bill', auth, role(['admin', 'kellner']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await billingService.printBillForTable(parseInt(req.params.tableId), req.user!.userId));
  } catch (err) { next(err); }
});

router.post('/settle-items', auth, role(['admin', 'kellner']), validate(settleItemsSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const bill = await billingService.settleItems(req.body.table_id, req.user!.userId, req.body.items, req.body);
    res.json(bill);
  } catch (err) { next(err); }
});

// Order-based billing (bar orders)
router.get('/order/:orderId/summary', auth, role(['admin', 'kellner', 'schank_kellner', 'kassa_spk']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await billingService.getOrderSummary(parseInt(req.params.orderId)));
  } catch (err) { next(err); }
});

router.post('/order/:orderId/settle', auth, role(['admin', 'kellner', 'schank_kellner', 'kassa_spk']), validate(settleTableSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const bill = await billingService.settleOrder(parseInt(req.params.orderId), req.user!.userId, req.body);
    res.json(bill);
  } catch (err) { next(err); }
});

router.get('/bills', auth, role(['admin']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filters = {
      date: req.query.date as string | undefined,
      waiter_id: req.query.waiter_id ? parseInt(req.query.waiter_id as string) : undefined,
    };
    res.json(await billingService.listBills(filters));
  } catch (err) { next(err); }
});

router.get('/bills/:id', auth, role(['admin']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await billingService.getBill(parseInt(req.params.id)));
  } catch (err) { next(err); }
});

export default router;

import { Router, Request, Response, NextFunction } from 'express';
import { auth } from '../middleware/auth.js';
import { role } from '../middleware/role.js';
import { validate } from '../middleware/validate.js';
import { createTableSchema, updateTableSchema, mergeTablesSchema, unmergeTableSchema } from '../shared/schemas.js';
import * as tablesService from '../services/tables.service.js';

const router = Router();

router.get('/', auth, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await tablesService.listTables());
  } catch (err) { next(err); }
});

router.get('/:id', auth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await tablesService.getTableWithOrders(parseInt(req.params.id)));
  } catch (err) { next(err); }
});

router.post('/', auth, role(['admin']), validate(createTableSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const table = await tablesService.createTable(req.body);
    res.status(201).json(table);
  } catch (err) { next(err); }
});

router.put('/:id', auth, role(['admin']), validate(updateTableSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const table = await tablesService.updateTable(parseInt(req.params.id), req.body);
    res.json(table);
  } catch (err) { next(err); }
});

router.delete('/:id', auth, role(['admin']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await tablesService.deleteTable(parseInt(req.params.id));
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.post('/merge', auth, role(['admin', 'kellner']), validate(mergeTablesSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await tablesService.mergeTables(req.body.primary_table_id, req.body.secondary_table_ids);
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.post('/unmerge', auth, role(['admin', 'kellner']), validate(unmergeTableSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await tablesService.unmergeTables(req.body.table_id);
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.post('/:id/release', auth, role(['kellner', 'admin']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const table = await tablesService.releaseTable(parseInt(req.params.id));
    res.json(table);
  } catch (err) { next(err); }
});

export default router;

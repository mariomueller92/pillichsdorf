import { Router, Request, Response, NextFunction } from 'express';
import { auth } from '../middleware/auth.js';
import { role } from '../middleware/role.js';
import { validate } from '../middleware/validate.js';
import { createTableSchema, updateTableSchema, mergeTablesSchema, unmergeTableSchema } from '../shared/schemas.js';
import * as tablesService from '../services/tables.service.js';
import * as socketService from '../services/socket.service.js';

const router = Router();

router.get('/', auth, (_req: Request, res: Response) => {
  res.json(tablesService.listTables());
});

router.get('/:id', auth, (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(tablesService.getTableWithOrders(parseInt(req.params.id)));
  } catch (err) { next(err); }
});

router.post('/', auth, role(['admin']), validate(createTableSchema), (req: Request, res: Response, next: NextFunction) => {
  try {
    const table = tablesService.createTable(req.body);
    res.status(201).json(table);
  } catch (err) { next(err); }
});

router.put('/:id', auth, role(['admin']), validate(updateTableSchema), (req: Request, res: Response, next: NextFunction) => {
  try {
    const table = tablesService.updateTable(parseInt(req.params.id), req.body);
    socketService.emitTableStatusChanged({ tableId: table.id, tableNumber: table.table_number, status: table.status });
    res.json(table);
  } catch (err) { next(err); }
});

router.delete('/:id', auth, role(['admin']), (req: Request, res: Response, next: NextFunction) => {
  try {
    tablesService.deleteTable(parseInt(req.params.id));
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.post('/merge', auth, role(['admin', 'kellner']), validate(mergeTablesSchema), (req: Request, res: Response, next: NextFunction) => {
  try {
    tablesService.mergeTables(req.body.primary_table_id, req.body.secondary_table_ids);
    socketService.emitTableMerged({ primaryTableId: req.body.primary_table_id, secondaryTableIds: req.body.secondary_table_ids });
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.post('/unmerge', auth, role(['admin', 'kellner']), validate(unmergeTableSchema), (req: Request, res: Response, next: NextFunction) => {
  try {
    tablesService.unmergeTables(req.body.table_id);
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.post('/:id/release', auth, role(['kellner', 'admin']), (req: Request, res: Response, next: NextFunction) => {
  try {
    const table = tablesService.releaseTable(parseInt(req.params.id));
    res.json(table);
  } catch (err) { next(err); }
});

export default router;

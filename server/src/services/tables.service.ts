import { getDb } from '../database.js';
import { Table } from '../shared/types.js';
import { AppError } from '../middleware/errorHandler.js';
import * as socketService from './socket.service.js';

export function listTables(): Table[] {
  return getDb().prepare(`
    SELECT t.*,
      CASE WHEN EXISTS (
        SELECT 1 FROM orders o
        WHERE o.table_id = t.id
          AND o.status IN ('offen', 'in_bearbeitung', 'fertig')
      ) THEN 1 ELSE 0 END AS has_pending_items,
      (
        SELECT MIN(o.created_at) FROM orders o
        WHERE o.table_id = t.id
          AND o.status IN ('offen', 'in_bearbeitung', 'fertig')
      ) AS oldest_pending_at,
      (
        SELECT MIN(o.created_at) FROM orders o
        WHERE o.table_id = t.id
          AND o.status != 'storniert'
          AND NOT EXISTS (
            SELECT 1 FROM bill_items bi
            JOIN order_items oi ON bi.order_item_id = oi.id
            WHERE oi.order_id = o.id
          )
      ) AS session_started_at
    FROM tables t
    WHERE t.is_active = 1
    ORDER BY t.sort_order, t.table_number
  `).all() as Table[];
}

export function getTable(id: number): Table {
  const table = getDb().prepare('SELECT * FROM tables WHERE id = ?').get(id) as Table | undefined;
  if (!table) throw new AppError(404, 'Tisch nicht gefunden');
  return table;
}

export function createTable(data: { table_number: string; capacity?: number | null; sort_order?: number }): Table {
  const db = getDb();
  const existing = db.prepare('SELECT id, is_active FROM tables WHERE table_number = ?').get(data.table_number) as { id: number; is_active: number } | undefined;

  if (existing) {
    if (existing.is_active === 1) {
      throw new AppError(409, 'Tischnummer bereits vergeben');
    }
    db.prepare(
      "UPDATE tables SET is_active = 1, status = 'frei', capacity = ?, sort_order = ?, merged_into_id = NULL, updated_at = datetime('now') WHERE id = ?"
    ).run(data.capacity ?? null, data.sort_order ?? 0, existing.id);
    return getTable(existing.id);
  }

  const result = db.prepare(
    'INSERT INTO tables (table_number, capacity, sort_order) VALUES (?, ?, ?)'
  ).run(data.table_number, data.capacity ?? null, data.sort_order ?? 0);
  return getTable(result.lastInsertRowid as number);
}

export function updateTable(id: number, data: Partial<Table>): Table {
  getTable(id);
  const updates: string[] = [];
  const values: any[] = [];

  if (data.table_number !== undefined) { updates.push('table_number = ?'); values.push(data.table_number); }
  if (data.capacity !== undefined) { updates.push('capacity = ?'); values.push(data.capacity); }
  if ((data as any).sort_order !== undefined) { updates.push('sort_order = ?'); values.push((data as any).sort_order); }
  if (data.status !== undefined) { updates.push('status = ?'); values.push(data.status); }
  if (data.is_active !== undefined) { updates.push('is_active = ?'); values.push(data.is_active); }

  if (updates.length > 0) {
    updates.push("updated_at = datetime('now')");
    values.push(id);
    try {
      getDb().prepare(`UPDATE tables SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    } catch (err: any) {
      if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        throw new AppError(409, 'Tischnummer bereits vergeben');
      }
      throw err;
    }
  }
  return getTable(id);
}

export function deleteTable(id: number): void {
  const result = getDb().prepare("UPDATE tables SET is_active = 0, updated_at = datetime('now') WHERE id = ?").run(id);
  if (result.changes === 0) throw new AppError(404, 'Tisch nicht gefunden');
}

export function mergeTables(primaryTableId: number, secondaryTableIds: number[]): void {
  const db = getDb();
  const primary = getTable(primaryTableId);

  const mergeTransaction = db.transaction(() => {
    for (const secId of secondaryTableIds) {
      const sec = getTable(secId);
      // Move all open orders from secondary to primary
      db.prepare(
        "UPDATE orders SET table_id = ?, updated_at = datetime('now') WHERE table_id = ? AND status IN ('offen', 'in_bearbeitung', 'fertig')"
      ).run(primaryTableId, secId);
      // Mark secondary as merged
      db.prepare(
        "UPDATE tables SET merged_into_id = ?, status = 'besetzt', updated_at = datetime('now') WHERE id = ?"
      ).run(primaryTableId, secId);
    }
    // Ensure primary is besetzt
    db.prepare(
      "UPDATE tables SET status = 'besetzt', updated_at = datetime('now') WHERE id = ?"
    ).run(primaryTableId);
  });

  mergeTransaction();
}

export function unmergeTables(tableId: number): void {
  const db = getDb();
  db.transaction(() => {
    db.prepare(
      "UPDATE tables SET merged_into_id = NULL, updated_at = datetime('now') WHERE merged_into_id = ?"
    ).run(tableId);
  })();
}

export function requestBill(tableId: number): Table {
  const table = getTable(tableId);
  getDb().prepare(
    "UPDATE tables SET status = 'rechnung_angefordert', updated_at = datetime('now') WHERE id = ?"
  ).run(tableId);
  const updated = getTable(tableId);
  socketService.emitTableStatusChanged({
    tableId: updated.id,
    tableNumber: updated.table_number,
    status: 'rechnung_angefordert',
  });
  return updated;
}

export function getTableWithOrders(id: number) {
  const db = getDb();
  const table = getTable(id);
  const orders = db.prepare(`
    SELECT o.*, u.display_name as waiter_name
    FROM orders o
    JOIN users u ON o.waiter_id = u.id
    WHERE o.table_id = ?
      AND o.status != 'storniert'
      AND NOT EXISTS (
        SELECT 1 FROM bill_items bi
        JOIN order_items oi ON bi.order_item_id = oi.id
        WHERE oi.order_id = o.id
      )
    ORDER BY o.created_at DESC
  `).all(id) as any[];

  if (orders.length > 0) {
    const orderIds = orders.map(o => o.id);
    const placeholders = orderIds.map(() => '?').join(',');
    const items = db.prepare(`
      SELECT oi.*, mi.name as item_name, mi.availability_mode,
             mc.target as category_target, mc.name as category_name
      FROM order_items oi
      JOIN menu_items mi ON oi.menu_item_id = mi.id
      JOIN menu_categories mc ON mi.category_id = mc.id
      WHERE oi.order_id IN (${placeholders})
        AND oi.status != 'storniert'
      ORDER BY oi.created_at
    `).all(...orderIds) as any[];

    const itemsByOrder = new Map<number, any[]>();
    for (const item of items) {
      const list = itemsByOrder.get(item.order_id) ?? [];
      list.push(item);
      itemsByOrder.set(item.order_id, list);
    }
    for (const order of orders) {
      order.items = itemsByOrder.get(order.id) ?? [];
    }
  }

  const mergedTables = db.prepare(
    'SELECT * FROM tables WHERE merged_into_id = ? AND is_active = 1'
  ).all(id) as Table[];

  const sessionStartedAt = orders.length > 0
    ? orders[orders.length - 1].created_at
    : null;

  return { ...table, orders, merged_tables: mergedTables, session_started_at: sessionStartedAt };
}

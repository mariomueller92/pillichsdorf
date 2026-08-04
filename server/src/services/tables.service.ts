import { queryOne, queryAll, execute, withTransaction } from '../database.js';
import { Table } from '../shared/types.js';
import { AppError } from '../middleware/errorHandler.js';

export async function listTables(): Promise<Table[]> {
  return queryAll<Table>(`
    SELECT t.*,
      CASE WHEN EXISTS (
        SELECT 1 FROM orders o
        WHERE o.table_id = t.id
          AND o.status IN ('offen', 'in_bearbeitung', 'fertig')
      ) THEN 1 ELSE 0 END AS has_pending_items,
      CASE WHEN EXISTS (
        SELECT 1 FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        WHERE o.table_id = t.id
          AND o.status != 'storniert'
          AND oi.status IN ('neu', 'in_zubereitung', 'fertig')
      ) THEN 1 ELSE 0 END AS has_undelivered_items,
      (
        SELECT MIN(o.created_at) FROM orders o
        WHERE o.table_id = t.id
          AND o.status IN ('offen', 'in_bearbeitung', 'fertig')
      ) AS oldest_pending_at,
      (
        SELECT MIN(o.created_at) FROM orders o
        WHERE o.table_id = t.id
          AND o.status != 'storniert'
          AND EXISTS (
            SELECT 1 FROM order_items oi
            WHERE oi.order_id = o.id
              AND oi.status != 'storniert'
              AND oi.quantity > COALESCE((SELECT SUM(quantity) FROM bill_items WHERE order_item_id = oi.id), 0)
          )
      ) AS session_started_at
    FROM tables t
    WHERE t.is_active = true
    ORDER BY t.sort_order, t.table_number
  `);
}

export async function getTable(id: number): Promise<Table> {
  const table = await queryOne<Table>('SELECT * FROM tables WHERE id = ?', [id]);
  if (!table) throw new AppError(404, 'Tisch nicht gefunden');
  return table;
}

export async function createTable(data: { table_number: string; capacity?: number | null; sort_order?: number }): Promise<Table> {
  const existing = await queryOne<{ id: number; is_active: boolean }>(
    'SELECT id, is_active FROM tables WHERE table_number = ?', [data.table_number]
  );

  if (existing) {
    if (existing.is_active) {
      throw new AppError(409, 'Tischnummer bereits vergeben');
    }
    await execute(
      "UPDATE tables SET is_active = true, status = 'frei', capacity = ?, sort_order = ?, merged_into_id = NULL, updated_at = now() WHERE id = ?",
      [data.capacity ?? null, data.sort_order ?? 0, existing.id]
    );
    return getTable(existing.id);
  }

  const row = await queryOne<{ id: number }>(
    'INSERT INTO tables (table_number, capacity, sort_order) VALUES (?, ?, ?) RETURNING id',
    [data.table_number, data.capacity ?? null, data.sort_order ?? 0]
  );
  return getTable(row!.id);
}

export async function updateTable(id: number, data: Partial<Table>): Promise<Table> {
  await getTable(id);
  const updates: string[] = [];
  const values: any[] = [];

  if (data.table_number !== undefined) { updates.push('table_number = ?'); values.push(data.table_number); }
  if (data.capacity !== undefined) { updates.push('capacity = ?'); values.push(data.capacity); }
  if ((data as any).sort_order !== undefined) { updates.push('sort_order = ?'); values.push((data as any).sort_order); }
  if (data.status !== undefined) { updates.push('status = ?'); values.push(data.status); }
  if (data.is_active !== undefined) { updates.push('is_active = ?'); values.push(data.is_active); }

  if (updates.length > 0) {
    updates.push('updated_at = now()');
    values.push(id);
    try {
      await execute(`UPDATE tables SET ${updates.join(', ')} WHERE id = ?`, values);
    } catch (err: any) {
      if (err.code === '23505') {
        throw new AppError(409, 'Tischnummer bereits vergeben');
      }
      throw err;
    }
  }
  return getTable(id);
}

export async function deleteTable(id: number): Promise<void> {
  const result = await execute("UPDATE tables SET is_active = false, updated_at = now() WHERE id = ?", [id]);
  if (result.rowCount === 0) throw new AppError(404, 'Tisch nicht gefunden');
}

export async function mergeTables(primaryTableId: number, secondaryTableIds: number[]): Promise<void> {
  await getTable(primaryTableId);

  await withTransaction(async (tx) => {
    for (const secId of secondaryTableIds) {
      await getTable(secId);
      // Move all open orders from secondary to primary
      await tx.execute(
        "UPDATE orders SET table_id = ?, updated_at = now() WHERE table_id = ? AND status IN ('offen', 'in_bearbeitung', 'fertig')",
        [primaryTableId, secId]
      );
      // Mark secondary as merged
      await tx.execute(
        "UPDATE tables SET merged_into_id = ?, status = 'besetzt', updated_at = now() WHERE id = ?",
        [primaryTableId, secId]
      );
    }
    // Ensure primary is besetzt
    await tx.execute(
      "UPDATE tables SET status = 'besetzt', updated_at = now() WHERE id = ?", [primaryTableId]
    );
  });
}

export async function unmergeTables(tableId: number): Promise<void> {
  await execute(
    "UPDATE tables SET merged_into_id = NULL, updated_at = now() WHERE merged_into_id = ?", [tableId]
  );
}

export async function releaseTable(tableId: number): Promise<Table> {
  const table = await getTable(tableId);

  const openOrders = await queryOne<{ count: number }>(
    "SELECT COUNT(*) as count FROM orders WHERE table_id = ? AND status IN ('offen', 'in_bearbeitung', 'fertig')",
    [tableId]
  );
  if (openOrders!.count > 0) {
    throw new AppError(400, 'Tisch hat offene Bestellungen und kann nicht freigegeben werden');
  }

  // Prüfe ob es Positionen gibt, die weder abgerechnet noch storniert sind
  const unbilledAndNotCancelled = await queryOne<{ count: number }>(`
    SELECT COUNT(*) as count
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    WHERE o.table_id = ?
      AND oi.status != 'storniert'
      AND oi.quantity > COALESCE((SELECT SUM(quantity) FROM bill_items WHERE order_item_id = oi.id), 0)
  `, [tableId]);
  if (unbilledAndNotCancelled!.count > 0) {
    throw new AppError(400, 'Tisch hat nicht abgerechnete Posten');
  }

  await withTransaction(async (tx) => {
    const mergedTables = await tx.queryAll<{ id: number }>('SELECT id FROM tables WHERE merged_into_id = ?', [tableId]);
    if (mergedTables.length > 0) {
      await tx.execute(
        "UPDATE tables SET merged_into_id = NULL, updated_at = now() WHERE merged_into_id = ?", [tableId]
      );
      for (const mt of mergedTables) {
        await tx.execute(
          "UPDATE tables SET status = 'frei', updated_at = now() WHERE id = ?", [mt.id]
        );
      }
    }
    await tx.execute(
      "UPDATE tables SET status = 'frei', updated_at = now() WHERE id = ?", [tableId]
    );
  });

  return getTable(tableId);
}

export async function getTableWithOrders(id: number) {
  const table = await getTable(id);
  const orders = await queryAll<any>(`
    SELECT o.*, u.display_name as waiter_name
    FROM orders o
    JOIN users u ON o.waiter_id = u.id
    WHERE o.table_id = ?
      AND o.status != 'storniert'
      AND EXISTS (
        SELECT 1 FROM order_items oi
        WHERE oi.order_id = o.id
          AND oi.status != 'storniert'
          AND oi.quantity > COALESCE((SELECT SUM(quantity) FROM bill_items WHERE order_item_id = oi.id), 0)
      )
    ORDER BY o.created_at DESC
  `, [id]);

  if (orders.length > 0) {
    const orderIds = orders.map(o => o.id);
    const placeholders = orderIds.map(() => '?').join(',');
    const items = await queryAll<any>(`
      SELECT oi.*, mi.name as item_name, mi.availability_mode,
             mc.target as category_target, mc.name as category_name
      FROM order_items oi
      JOIN menu_items mi ON oi.menu_item_id = mi.id
      JOIN menu_categories mc ON mi.category_id = mc.id
      WHERE oi.order_id IN (${placeholders})
        AND oi.status != 'storniert'
      ORDER BY oi.created_at
    `, orderIds);

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

  const mergedTables = await queryAll<Table>(
    'SELECT * FROM tables WHERE merged_into_id = ? AND is_active = true', [id]
  );

  const sessionStartedAt = orders.length > 0
    ? orders[orders.length - 1].created_at
    : null;

  return { ...table, orders, merged_tables: mergedTables, session_started_at: sessionStartedAt };
}

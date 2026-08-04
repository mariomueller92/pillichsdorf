import { queryOne, queryAll, execute, withTransaction, Tx } from '../database.js';
import { OrderItemStatus } from '../shared/types.js';
import { AppError } from '../middleware/errorHandler.js';
import { printUnifiedBon } from '../printer/templates.js';
import { JETON_ITEM_JOIN, JETON_ITEM_COLUMNS } from './billing.service.js';

export async function listOrders(filters: { table_id?: number; status?: string; waiter_id?: number }) {
  let query = `
    SELECT o.*, u.display_name as waiter_name, t.table_number
    FROM orders o
    JOIN users u ON o.waiter_id = u.id
    LEFT JOIN tables t ON o.table_id = t.id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (filters.table_id) { query += ' AND o.table_id = ?'; params.push(filters.table_id); }
  if (filters.status) { query += ' AND o.status = ?'; params.push(filters.status); }
  if (filters.waiter_id) { query += ' AND o.waiter_id = ?'; params.push(filters.waiter_id); }

  query += ' ORDER BY o.created_at DESC';
  return queryAll(query, params);
}

export async function getOrder(id: number) {
  const order = await queryOne<any>(`
    SELECT o.*, u.display_name as waiter_name, t.table_number
    FROM orders o
    JOIN users u ON o.waiter_id = u.id
    LEFT JOIN tables t ON o.table_id = t.id
    WHERE o.id = ?
  `, [id]);

  if (!order) throw new AppError(404, 'Bestellung nicht gefunden');

  const items = await queryAll(`
    SELECT oi.*, mi.name as item_name, mi.availability_mode, mc.target as category_target, mc.name as category_name,
           ${JETON_ITEM_COLUMNS}
    FROM order_items oi
    JOIN menu_items mi ON oi.menu_item_id = mi.id
    JOIN menu_categories mc ON mi.category_id = mc.id
    ${JETON_ITEM_JOIN}
    WHERE oi.order_id = ?
    ORDER BY oi.created_at
  `, [id]);

  return { ...order, items };
}

export async function createOrder(data: {
  table_id: number | null;
  waiter_id: number;
  notes?: string | null;
  items: Array<{ menu_item_id: number; quantity: number; notes?: string | null }>;
  print_order_bon?: boolean;
}) {
  const orderId = await withTransaction(async (tx) => {
    // Auto-assign bar slot if no table
    let barSlot: string | null = null;
    if (data.table_id === null || data.table_id === undefined) {
      const usedSlots = await tx.queryAll<{ bar_slot: string }>(
        "SELECT bar_slot FROM orders WHERE bar_slot IS NOT NULL AND status IN ('offen','in_bearbeitung','fertig') ORDER BY bar_slot"
      );
      const usedSet = new Set(usedSlots.map((r) => r.bar_slot));
      for (let i = 1; i <= 20; i++) {
        const slot = `B${i}`;
        if (!usedSet.has(slot)) {
          barSlot = slot;
          break;
        }
      }
    }

    // Create order
    const orderRow = await tx.queryOne<{ id: number }>(
      'INSERT INTO orders (table_id, bar_slot, waiter_id, notes) VALUES (?, ?, ?, ?) RETURNING id',
      [data.table_id, barSlot, data.waiter_id, data.notes || null]
    );
    const orderId = orderRow!.id;

    // Create order items with price snapshot
    for (const item of data.items) {
      const menuItem = await tx.queryOne<{ price: number; is_available: boolean }>(
        'SELECT price, is_available FROM menu_items WHERE id = ? AND is_active = true', [item.menu_item_id]
      );
      if (!menuItem) throw new AppError(400, `Artikel ${item.menu_item_id} nicht gefunden`);
      if (!menuItem.is_available) throw new AppError(400, `Artikel ${item.menu_item_id} nicht verfügbar`);
      await tx.execute(
        'INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price, notes) VALUES (?, ?, ?, ?, ?)',
        [orderId, item.menu_item_id, item.quantity, menuItem.price, item.notes || null]
      );
    }

    // Set table to besetzt if applicable
    if (data.table_id) {
      await tx.execute("UPDATE tables SET status = 'besetzt', updated_at = now() WHERE id = ?", [data.table_id]);
    }

    return orderId;
  });

  const order = await getOrder(orderId);

  // Bestellbon drucken (Sofort-Positionen oben, Kueche unten mit Abrisskante).
  // Bei Barverkäufen (kein Tisch) grundsätzlich KEIN Bestellbon — Ware wird direkt
  // an der Bar ausgegeben. Zusätzlich kann der Client explizit print_order_bon=false setzen.
  const isBarOrder = !data.table_id;
  const shouldPrintOrder = data.print_order_bon !== false && !isBarOrder;
  if (shouldPrintOrder) {
    await printUnifiedBon({
      orderId: order.id,
      tableNumber: order.table_number,
      barSlot: order.bar_slot,
      waiterName: order.waiter_name,
      items: order.items.map((i: any) => ({
        quantity: i.quantity,
        item_name: i.item_name,
        notes: i.notes,
        availability_mode: i.availability_mode || 'sofort',
      })),
      notes: order.notes,
      createdAt: order.created_at,
    });
  }

  return order;
}

export async function addItems(orderId: number, items: Array<{ menu_item_id: number; quantity: number; notes?: string | null }>) {
  const order = await getOrder(orderId);
  if (order.status === 'storniert' || order.status === 'serviert') {
    throw new AppError(400, 'Bestellung kann nicht mehr geaendert werden');
  }

  await withTransaction(async (tx) => {
    for (const item of items) {
      const menuItem = await tx.queryOne<{ price: number; is_available: boolean }>(
        'SELECT price, is_available FROM menu_items WHERE id = ? AND is_active = true', [item.menu_item_id]
      );
      if (!menuItem) throw new AppError(400, `Artikel ${item.menu_item_id} nicht gefunden`);
      if (!menuItem.is_available) throw new AppError(400, `Artikel ${item.menu_item_id} nicht verfügbar`);
      await tx.execute(
        'INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price, notes) VALUES (?, ?, ?, ?, ?)',
        [orderId, item.menu_item_id, item.quantity, menuItem.price, item.notes || null]
      );
    }
    await tx.execute("UPDATE orders SET updated_at = now() WHERE id = ?", [orderId]);
  });

  const updated = await getOrder(orderId);

  // Emit update + print unified bon for new items only — Barbestellungen bekommen keinen Bon.
  const newItems = updated.items.filter((i: any) => i.status === 'neu');
  const isBarOrder = !updated.table_id;
  if (newItems.length > 0) {
    if (!isBarOrder) await printUnifiedBon({
      orderId: updated.id,
      tableNumber: updated.table_number,
      barSlot: updated.bar_slot,
      waiterName: updated.waiter_name,
      items: newItems.map((i: any) => ({
        quantity: i.quantity,
        item_name: i.item_name,
        notes: i.notes,
        availability_mode: i.availability_mode || 'sofort',
      })),
      notes: null,
      createdAt: updated.created_at,
    });
  }

  return updated;
}

export async function acknowledgeItems(orderId: number, itemIds: number[], status: OrderItemStatus, userId: number) {
  await withTransaction(async (tx) => {
    for (const itemId of itemIds) {
      await tx.execute(`
        UPDATE order_items SET status = ?, acknowledged_by = ?, acknowledged_at = now()
        WHERE id = ? AND order_id = ?
      `, [status, userId, itemId, orderId]);
    }
    await tx.execute("UPDATE orders SET updated_at = now() WHERE id = ?", [orderId]);

    // If all items are in_zubereitung or beyond, set order to in_bearbeitung
    const pendingItems = await tx.queryOne<{ count: number }>(
      "SELECT COUNT(*) as count FROM order_items WHERE order_id = ? AND status = 'neu'", [orderId]
    );
    if (pendingItems!.count === 0) {
      await tx.execute("UPDATE orders SET status = 'in_bearbeitung', updated_at = now() WHERE id = ? AND status = 'offen'", [orderId]);
    }

    // If all items are fertig, set order to fertig
    const nonFertigItems = await tx.queryOne<{ count: number }>(
      "SELECT COUNT(*) as count FROM order_items WHERE order_id = ? AND status NOT IN ('fertig', 'serviert', 'storniert')", [orderId]
    );
    if (nonFertigItems!.count === 0) {
      await tx.execute("UPDATE orders SET status = 'fertig', updated_at = now() WHERE id = ? AND status != 'storniert'", [orderId]);
    }
  });

  const updated = await getOrder(orderId);
  return updated;
}

export async function updateItemStatus(orderId: number, itemId: number, status: OrderItemStatus) {
  await withTransaction(async (tx) => {
    await tx.execute('UPDATE order_items SET status = ? WHERE id = ? AND order_id = ?', [status, itemId, orderId]);
    await recalcOrderStatus(tx, orderId);
  });
  return getOrder(orderId);
}

async function recalcOrderStatus(tx: Tx, orderId: number) {
  const current = await tx.queryOne<{ status: string }>('SELECT status FROM orders WHERE id = ?', [orderId]);
  if (!current || current.status === 'storniert') return;

  const counts = await tx.queryOne<{ neu: number; in_zubereitung: number; fertig: number; serviert: number; storniert: number; total: number }>(`
    SELECT
      SUM(CASE WHEN status = 'neu' THEN 1 ELSE 0 END) as neu,
      SUM(CASE WHEN status = 'in_zubereitung' THEN 1 ELSE 0 END) as in_zubereitung,
      SUM(CASE WHEN status = 'fertig' THEN 1 ELSE 0 END) as fertig,
      SUM(CASE WHEN status = 'serviert' THEN 1 ELSE 0 END) as serviert,
      SUM(CASE WHEN status = 'storniert' THEN 1 ELSE 0 END) as storniert,
      COUNT(*) as total
    FROM order_items WHERE order_id = ?
  `, [orderId]);

  if (!counts || counts.total === 0) return;

  let next: string;
  if (counts.serviert + counts.storniert === counts.total) {
    // All items are either serviert or storniert
    if (counts.serviert > 0) {
      next = 'serviert';
    } else {
      // All items are storniert
      next = 'storniert';
    }
  } else if (counts.fertig + counts.serviert + counts.storniert === counts.total && counts.fertig > 0) {
    next = 'fertig';
  } else if (counts.in_zubereitung > 0 || counts.fertig > 0 || counts.serviert > 0) {
    next = 'in_bearbeitung';
  } else {
    next = 'offen';
  }

  await tx.execute("UPDATE orders SET status = ?, updated_at = now() WHERE id = ?", [next, orderId]);
}

export async function cancelOrder(orderId: number) {
  const order = await getOrder(orderId);

  const billedCount = await queryOne<{ count: number }>(`
    SELECT COUNT(*) as count FROM bill_items
    WHERE order_item_id IN (SELECT id FROM order_items WHERE order_id = ?)
  `, [orderId]);
  if (billedCount!.count > 0) {
    throw new AppError(400, 'Bestellung bereits abgerechnet');
  }

  await withTransaction(async (tx) => {
    await tx.execute("UPDATE orders SET status = 'storniert', updated_at = now() WHERE id = ?", [orderId]);
    await tx.execute("UPDATE order_items SET status = 'storniert' WHERE order_id = ?", [orderId]);
  });

  // Check if table has any other open orders, if not, free it
  if (order.table_id) {
    const otherOrders = await queryOne<{ count: number }>(
      "SELECT COUNT(*) as count FROM orders WHERE table_id = ? AND id != ? AND status IN ('offen', 'in_bearbeitung', 'fertig')",
      [order.table_id, orderId]
    );
    if (otherOrders!.count === 0) {
      await execute("UPDATE tables SET status = 'frei', updated_at = now() WHERE id = ?", [order.table_id]);
    }
  }

  return getOrder(orderId);
}

export async function transferOrder(orderId: number, targetTableId: number) {
  const order = await getOrder(orderId);
  const oldTableId = order.table_id;

  await withTransaction(async (tx) => {
    await tx.execute("UPDATE orders SET table_id = ?, updated_at = now() WHERE id = ?", [targetTableId, orderId]);
    await tx.execute("UPDATE tables SET status = 'besetzt', updated_at = now() WHERE id = ?", [targetTableId]);

    // Free old table if no more open orders
    if (oldTableId) {
      const remaining = await tx.queryOne<{ count: number }>(
        "SELECT COUNT(*) as count FROM orders WHERE table_id = ? AND id != ? AND status IN ('offen', 'in_bearbeitung', 'fertig')",
        [oldTableId, orderId]
      );
      if (remaining!.count === 0) {
        await tx.execute("UPDATE tables SET status = 'frei', updated_at = now() WHERE id = ?", [oldTableId]);
      }
    }
  });

  return getOrder(orderId);
}

// Get all active orders for kitchen/bar views
export async function getActiveOrders(target?: 'kueche' | 'schank') {
  const orders = await queryAll<any>(`
    SELECT o.*, u.display_name as waiter_name, t.table_number
    FROM orders o
    JOIN users u ON o.waiter_id = u.id
    LEFT JOIN tables t ON o.table_id = t.id
    WHERE o.status IN ('offen', 'in_bearbeitung')
    ORDER BY o.created_at ASC
  `);

  const withItems = await Promise.all(orders.map(async (order) => {
    let items = await queryAll<any>(`
      SELECT oi.*, mi.name as item_name, mi.availability_mode, mc.target as category_target, mc.name as category_name
      FROM order_items oi
      JOIN menu_items mi ON oi.menu_item_id = mi.id
      JOIN menu_categories mc ON mi.category_id = mc.id
      WHERE oi.order_id = ? AND oi.status NOT IN ('serviert', 'storniert')
      ORDER BY oi.created_at
    `, [order.id]);

    if (target) {
      items = items.filter((i: any) => i.category_target === target);
    }

    return { ...order, items };
  }));

  return withItems.filter(o => o.items.length > 0);
}

export async function moveBarToTable(orderId: number, targetTableId: number) {
  const order = await getOrder(orderId);

  if (!order.bar_slot) {
    throw new AppError(400, 'Bestellung hat keinen Bar-Slot');
  }
  if (order.table_id) {
    throw new AppError(400, 'Bestellung ist bereits einem Tisch zugeordnet');
  }

  await withTransaction(async (tx) => {
    await tx.execute(
      "UPDATE orders SET table_id = ?, bar_slot = NULL, updated_at = now() WHERE id = ?", [targetTableId, orderId]
    );
    await tx.execute(
      "UPDATE tables SET status = 'besetzt', updated_at = now() WHERE id = ?", [targetTableId]
    );
  });

  return getOrder(orderId);
}

export async function getTopItems(limit: number = 10) {
  return queryAll(`
    SELECT mi.id as menu_item_id,
           mi.name as item_name,
           mc.name as category_name,
           SUM(oi.quantity) as total_quantity,
           COUNT(DISTINCT oi.order_id) as order_count
    FROM order_items oi
    JOIN menu_items mi ON oi.menu_item_id = mi.id
    JOIN menu_categories mc ON mi.category_id = mc.id
    WHERE oi.status != 'storniert'
    GROUP BY mi.id
    ORDER BY total_quantity DESC
    LIMIT ?
  `, [limit]);
}

export async function listAllOrdersWithItems(filters: { from?: string; to?: string } = {}) {
  let where = '1=1';
  const params: any[] = [];
  if (filters.from) { where += ' AND o.created_at >= ?'; params.push(filters.from); }
  if (filters.to)   { where += ' AND o.created_at <  ?'; params.push(filters.to); }

  const orders = await queryAll<any>(`
    SELECT o.*, u.display_name as waiter_name, t.table_number
    FROM orders o
    JOIN users u ON o.waiter_id = u.id
    LEFT JOIN tables t ON o.table_id = t.id
    WHERE ${where}
    ORDER BY o.created_at DESC
  `, params);

  if (orders.length === 0) return [];

  const orderIds = orders.map(o => o.id);
  const placeholders = orderIds.map(() => '?').join(',');
  const items = await queryAll<any>(`
    SELECT oi.*, mi.name as item_name, mc.target as category_target, mc.name as category_name
    FROM order_items oi
    JOIN menu_items mi ON oi.menu_item_id = mi.id
    JOIN menu_categories mc ON mi.category_id = mc.id
    WHERE oi.order_id IN (${placeholders})
    ORDER BY oi.created_at
  `, orderIds);

  const itemsByOrder = new Map<number, any[]>();
  for (const it of items) {
    if (!itemsByOrder.has(it.order_id)) itemsByOrder.set(it.order_id, []);
    itemsByOrder.get(it.order_id)!.push(it);
  }

  return orders.map(o => {
    const orderItems = itemsByOrder.get(o.id) || [];
    const total = orderItems
      .filter(i => i.status !== 'storniert')
      .reduce((sum, i) => sum + i.unit_price * i.quantity, 0);
    return { ...o, items: orderItems, total };
  });
}

export async function reprintOrderBon(orderId: number) {
  const order = await getOrder(orderId);
  const items = (order.items as any[]).filter(i => i.status !== 'storniert');
  if (items.length === 0) {
    throw new AppError(400, 'Keine druckbaren Positionen in dieser Bestellung');
  }
  const ok = await printUnifiedBon({
    orderId: order.id,
    tableNumber: order.table_number,
    barSlot: order.bar_slot,
    waiterName: order.waiter_name,
    items: items.map((i: any) => ({
      quantity: i.quantity,
      item_name: i.item_name,
      notes: i.notes,
      availability_mode: i.availability_mode || 'sofort',
    })),
    notes: order.notes,
    createdAt: order.created_at,
    isReprint: true,
  });
  return { printed: ok, orderId };
}

export async function getPendingKitchenItems() {
  return queryAll(`
    SELECT oi.id, oi.order_id, oi.quantity, oi.notes, oi.status, oi.created_at,
           mi.name as item_name, mi.availability_mode,
           o.table_id, o.bar_slot, t.table_number,
           o.created_at as order_created_at
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    JOIN menu_items mi ON oi.menu_item_id = mi.id
    LEFT JOIN tables t ON o.table_id = t.id
    WHERE mi.availability_mode = 'lieferzeit'
      AND oi.status NOT IN ('serviert', 'storniert')
      AND o.status NOT IN ('serviert', 'storniert')
    ORDER BY o.created_at ASC
  `);
}

import { getDb } from '../database.js';
import { Order, OrderItem, OrderItemStatus } from '../shared/types.js';
import { AppError } from '../middleware/errorHandler.js';
import * as socketService from './socket.service.js';
import { printUnifiedBon } from '../printer/templates.js';

export function listOrders(filters: { table_id?: number; status?: string; waiter_id?: number }) {
  const db = getDb();
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
  return db.prepare(query).all(...params);
}

export function getOrder(id: number) {
  const db = getDb();
  const order = db.prepare(`
    SELECT o.*, u.display_name as waiter_name, t.table_number
    FROM orders o
    JOIN users u ON o.waiter_id = u.id
    LEFT JOIN tables t ON o.table_id = t.id
    WHERE o.id = ?
  `).get(id) as any;

  if (!order) throw new AppError(404, 'Bestellung nicht gefunden');

  const items = db.prepare(`
    SELECT oi.*, mi.name as item_name, mi.availability_mode, mc.target as category_target, mc.name as category_name
    FROM order_items oi
    JOIN menu_items mi ON oi.menu_item_id = mi.id
    JOIN menu_categories mc ON mi.category_id = mc.id
    WHERE oi.order_id = ?
    ORDER BY oi.created_at
  `).all(id);

  return { ...order, items };
}

export function createOrder(data: {
  table_id: number | null;
  waiter_id: number;
  notes?: string | null;
  items: Array<{ menu_item_id: number; quantity: number; notes?: string | null }>;
  print_order_bon?: boolean;
}) {
  const db = getDb();

  const result = db.transaction(() => {
    // Auto-assign bar slot if no table
    let barSlot: string | null = null;
    if (data.table_id === null || data.table_id === undefined) {
      const usedSlots = db.prepare(
        "SELECT bar_slot FROM orders WHERE bar_slot IS NOT NULL AND status IN ('offen','in_bearbeitung','fertig') ORDER BY bar_slot"
      ).all() as any[];
      const usedSet = new Set(usedSlots.map((r: any) => r.bar_slot));
      for (let i = 1; i <= 20; i++) {
        const slot = `B${i}`;
        if (!usedSet.has(slot)) {
          barSlot = slot;
          break;
        }
      }
    }

    // Create order
    const orderResult = db.prepare(
      'INSERT INTO orders (table_id, bar_slot, waiter_id, notes) VALUES (?, ?, ?, ?)'
    ).run(data.table_id, barSlot, data.waiter_id, data.notes || null);

    const orderId = orderResult.lastInsertRowid as number;

    // Create order items with price snapshot
    const insertItem = db.prepare(`
      INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price, notes)
      VALUES (?, ?, ?, ?, ?)
    `);

    for (const item of data.items) {
      const menuItem = db.prepare('SELECT price, is_available FROM menu_items WHERE id = ? AND is_active = 1').get(item.menu_item_id) as any;
      if (!menuItem) throw new AppError(400, `Artikel ${item.menu_item_id} nicht gefunden`);
      if (!menuItem.is_available) throw new AppError(400, `Artikel ${item.menu_item_id} nicht verfügbar`);
      insertItem.run(orderId, item.menu_item_id, item.quantity, menuItem.price, item.notes || null);
    }

    // Set table to besetzt if applicable
    if (data.table_id) {
      db.prepare("UPDATE tables SET status = 'besetzt', updated_at = datetime('now') WHERE id = ?").run(data.table_id);
    }

    return orderId;
  })();

  const order = getOrder(result);

  // Emit socket event for dashboard
  socketService.emitOrderNew('schank', {
    orderId: order.id,
    tableNumber: order.table_number,
    barSlot: order.bar_slot,
    tableId: order.table_id,
    waiterName: order.waiter_name,
    notes: order.notes,
    createdAt: order.created_at,
    items: order.items,
  });

  // Print unified bon (sofort items on top, kueche items on bottom with tear zone)
  // Barverkauf-Direktausgabe (z.B. Popcorn): Client kann print_order_bon=false setzen,
  // dann wird kein Bestellschein gedruckt.
  const shouldPrintOrder = data.print_order_bon !== false;
  if (shouldPrintOrder) {
    printUnifiedBon({
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

  if (data.table_id) {
    socketService.emitTableStatusChanged({
      tableId: data.table_id,
      tableNumber: order.table_number,
      status: 'besetzt',
    });
  }

  return order;
}

export function addItems(orderId: number, items: Array<{ menu_item_id: number; quantity: number; notes?: string | null }>) {
  const db = getDb();
  const order = getOrder(orderId);
  if (order.status === 'storniert' || order.status === 'serviert') {
    throw new AppError(400, 'Bestellung kann nicht mehr geaendert werden');
  }

  db.transaction(() => {
    const insertItem = db.prepare(`
      INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price, notes)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const item of items) {
      const menuItem = db.prepare('SELECT price, is_available FROM menu_items WHERE id = ? AND is_active = 1').get(item.menu_item_id) as any;
      if (!menuItem) throw new AppError(400, `Artikel ${item.menu_item_id} nicht gefunden`);
      if (!menuItem.is_available) throw new AppError(400, `Artikel ${item.menu_item_id} nicht verfügbar`);
      insertItem.run(orderId, item.menu_item_id, item.quantity, menuItem.price, item.notes || null);
    }
    db.prepare("UPDATE orders SET updated_at = datetime('now') WHERE id = ?").run(orderId);
  })();

  const updated = getOrder(orderId);

  // Emit update + print unified bon for new items only
  const newItems = updated.items.filter((i: any) => i.status === 'neu');
  if (newItems.length > 0) {
    socketService.emitOrderNew('schank', {
      orderId: updated.id,
      tableNumber: updated.table_number,
      barSlot: updated.bar_slot,
      waiterName: updated.waiter_name,
      items: newItems,
      createdAt: updated.created_at,
    });

    printUnifiedBon({
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

export function acknowledgeItems(orderId: number, itemIds: number[], status: OrderItemStatus, userId: number) {
  const db = getDb();
  const order = getOrder(orderId);

  db.transaction(() => {
    const updateStmt = db.prepare(`
      UPDATE order_items SET status = ?, acknowledged_by = ?, acknowledged_at = datetime('now')
      WHERE id = ? AND order_id = ?
    `);
    for (const itemId of itemIds) {
      updateStmt.run(status, userId, itemId, orderId);
    }
    db.prepare("UPDATE orders SET updated_at = datetime('now') WHERE id = ?").run(orderId);

    // If all items are in_zubereitung or beyond, set order to in_bearbeitung
    const pendingItems = db.prepare(
      "SELECT COUNT(*) as count FROM order_items WHERE order_id = ? AND status = 'neu'"
    ).get(orderId) as any;
    if (pendingItems.count === 0) {
      db.prepare("UPDATE orders SET status = 'in_bearbeitung', updated_at = datetime('now') WHERE id = ? AND status = 'offen'").run(orderId);
    }

    // If all items are fertig, set order to fertig
    const nonFertigItems = db.prepare(
      "SELECT COUNT(*) as count FROM order_items WHERE order_id = ? AND status NOT IN ('fertig', 'serviert', 'storniert')"
    ).get(orderId) as any;
    if (nonFertigItems.count === 0) {
      db.prepare("UPDATE orders SET status = 'fertig', updated_at = datetime('now') WHERE id = ? AND status != 'storniert'").run(orderId);
    }
  })();

  const updated = getOrder(orderId);

  // Notify waiter if items are ready
  if (status === 'fertig') {
    socketService.emitOrderItemReady(order.waiter_id, {
      orderId: updated.id,
      tableNumber: updated.table_number,
      tableId: updated.table_id,
      items: updated.items.filter((i: any) => itemIds.includes(i.id)),
    });
  }

  return updated;
}

export function updateItemStatus(orderId: number, itemId: number, status: OrderItemStatus) {
  const db = getDb();
  db.transaction(() => {
    db.prepare('UPDATE order_items SET status = ? WHERE id = ? AND order_id = ?').run(status, itemId, orderId);
    recalcOrderStatus(orderId);
  })();
  const updated = getOrder(orderId);
  socketService.emitOrderUpdated('kueche', { orderId });
  socketService.emitOrderUpdated('schank', { orderId });
  return updated;
}

function recalcOrderStatus(orderId: number) {
  const db = getDb();
  const current = db.prepare('SELECT status FROM orders WHERE id = ?').get(orderId) as { status: string } | undefined;
  if (!current || current.status === 'storniert') return;

  const counts = db.prepare(`
    SELECT
      SUM(CASE WHEN status = 'neu' THEN 1 ELSE 0 END) as neu,
      SUM(CASE WHEN status = 'in_zubereitung' THEN 1 ELSE 0 END) as in_zubereitung,
      SUM(CASE WHEN status = 'fertig' THEN 1 ELSE 0 END) as fertig,
      SUM(CASE WHEN status = 'serviert' THEN 1 ELSE 0 END) as serviert,
      SUM(CASE WHEN status = 'storniert' THEN 1 ELSE 0 END) as storniert,
      COUNT(*) as total
    FROM order_items WHERE order_id = ?
  `).get(orderId) as { neu: number; in_zubereitung: number; fertig: number; serviert: number; storniert: number; total: number };

  if (counts.total === 0) return;

  let next: string;
  if (counts.serviert + counts.storniert === counts.total && counts.serviert > 0) {
    next = 'serviert';
  } else if (counts.fertig + counts.serviert + counts.storniert === counts.total && counts.fertig > 0) {
    next = 'fertig';
  } else if (counts.in_zubereitung > 0 || counts.fertig > 0 || counts.serviert > 0) {
    next = 'in_bearbeitung';
  } else {
    next = 'offen';
  }

  db.prepare("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?").run(next, orderId);
}

export function cancelOrder(orderId: number) {
  const db = getDb();
  const order = getOrder(orderId);

  db.transaction(() => {
    db.prepare("UPDATE orders SET status = 'storniert', updated_at = datetime('now') WHERE id = ?").run(orderId);
    db.prepare("UPDATE order_items SET status = 'storniert' WHERE order_id = ?").run(orderId);
  })();

  // Check if table has any other open orders, if not, free it
  if (order.table_id) {
    const otherOrders = db.prepare(
      "SELECT COUNT(*) as count FROM orders WHERE table_id = ? AND id != ? AND status IN ('offen', 'in_bearbeitung', 'fertig')"
    ).get(order.table_id, orderId) as any;
    if (otherOrders.count === 0) {
      db.prepare("UPDATE tables SET status = 'frei', updated_at = datetime('now') WHERE id = ?").run(order.table_id);
      socketService.emitTableStatusChanged({
        tableId: order.table_id,
        tableNumber: order.table_number,
        status: 'frei',
      });
    }
  }

  socketService.emitOrderCancelled('kueche', { orderId, tableNumber: order.table_number });
  socketService.emitOrderCancelled('schank', { orderId, tableNumber: order.table_number });

  return getOrder(orderId);
}

export function transferOrder(orderId: number, targetTableId: number) {
  const db = getDb();
  const order = getOrder(orderId);
  const oldTableId = order.table_id;

  db.transaction(() => {
    db.prepare("UPDATE orders SET table_id = ?, updated_at = datetime('now') WHERE id = ?").run(targetTableId, orderId);
    db.prepare("UPDATE tables SET status = 'besetzt', updated_at = datetime('now') WHERE id = ?").run(targetTableId);

    // Free old table if no more open orders
    if (oldTableId) {
      const remaining = db.prepare(
        "SELECT COUNT(*) as count FROM orders WHERE table_id = ? AND id != ? AND status IN ('offen', 'in_bearbeitung', 'fertig')"
      ).get(oldTableId, orderId) as any;
      if (remaining.count === 0) {
        db.prepare("UPDATE tables SET status = 'frei', updated_at = datetime('now') WHERE id = ?").run(oldTableId);
      }
    }
  })();

  socketService.emitTableStatusChanged({ tableId: targetTableId, status: 'besetzt' });
  if (oldTableId) {
    const remaining = db.prepare(
      "SELECT COUNT(*) as count FROM orders WHERE table_id = ? AND status IN ('offen', 'in_bearbeitung', 'fertig')"
    ).get(oldTableId) as any;
    if (remaining.count === 0) {
      socketService.emitTableStatusChanged({ tableId: oldTableId, status: 'frei' });
    }
  }

  return getOrder(orderId);
}

// Get all active orders for kitchen/bar views
export function getActiveOrders(target?: 'kueche' | 'schank') {
  const db = getDb();
  const orders = db.prepare(`
    SELECT o.*, u.display_name as waiter_name, t.table_number
    FROM orders o
    JOIN users u ON o.waiter_id = u.id
    LEFT JOIN tables t ON o.table_id = t.id
    WHERE o.status IN ('offen', 'in_bearbeitung')
    ORDER BY o.created_at ASC
  `).all() as any[];

  return orders.map(order => {
    let items = db.prepare(`
      SELECT oi.*, mi.name as item_name, mi.availability_mode, mc.target as category_target, mc.name as category_name
      FROM order_items oi
      JOIN menu_items mi ON oi.menu_item_id = mi.id
      JOIN menu_categories mc ON mi.category_id = mc.id
      WHERE oi.order_id = ? AND oi.status NOT IN ('serviert', 'storniert')
      ORDER BY oi.created_at
    `).all(order.id);

    if (target) {
      items = items.filter((i: any) => i.category_target === target);
    }

    return { ...order, items };
  }).filter(o => o.items.length > 0);
}

export function moveBarToTable(orderId: number, targetTableId: number) {
  const db = getDb();
  const order = getOrder(orderId);

  if (!order.bar_slot) {
    throw new AppError(400, 'Bestellung hat keinen Bar-Slot');
  }
  if (order.table_id) {
    throw new AppError(400, 'Bestellung ist bereits einem Tisch zugeordnet');
  }

  db.transaction(() => {
    db.prepare(
      "UPDATE orders SET table_id = ?, bar_slot = NULL, updated_at = datetime('now') WHERE id = ?"
    ).run(targetTableId, orderId);
    db.prepare(
      "UPDATE tables SET status = 'besetzt', updated_at = datetime('now') WHERE id = ?"
    ).run(targetTableId);
  })();

  const updated = getOrder(orderId);
  const table = db.prepare('SELECT table_number FROM tables WHERE id = ?').get(targetTableId) as any;

  socketService.emitTableStatusChanged({
    tableId: targetTableId,
    tableNumber: table?.table_number,
    status: 'besetzt',
  });
  socketService.emitOrderMovedToTable({
    orderId,
    targetTableId,
    tableNumber: table?.table_number,
  });

  return updated;
}

export function getTopItems(limit: number = 10) {
  const db = getDb();
  return db.prepare(`
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
  `).all(limit);
}

export function listAllOrdersWithItems(filters: { from?: string; to?: string } = {}) {
  const db = getDb();

  let where = '1=1';
  const params: any[] = [];
  if (filters.from) { where += ' AND o.created_at >= ?'; params.push(filters.from); }
  if (filters.to)   { where += ' AND o.created_at <  ?'; params.push(filters.to); }

  const orders = db.prepare(`
    SELECT o.*, u.display_name as waiter_name, t.table_number
    FROM orders o
    JOIN users u ON o.waiter_id = u.id
    LEFT JOIN tables t ON o.table_id = t.id
    WHERE ${where}
    ORDER BY o.created_at DESC
  `).all(...params) as any[];

  if (orders.length === 0) return [];

  const orderIds = orders.map(o => o.id);
  const placeholders = orderIds.map(() => '?').join(',');
  const items = db.prepare(`
    SELECT oi.*, mi.name as item_name, mc.target as category_target, mc.name as category_name
    FROM order_items oi
    JOIN menu_items mi ON oi.menu_item_id = mi.id
    JOIN menu_categories mc ON mi.category_id = mc.id
    WHERE oi.order_id IN (${placeholders})
    ORDER BY oi.created_at
  `).all(...orderIds) as any[];

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

export function getPendingKitchenItems() {
  const db = getDb();
  return db.prepare(`
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
  `).all();
}

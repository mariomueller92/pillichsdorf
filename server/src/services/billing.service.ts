import { getDb } from '../database.js';
import { AppError } from '../middleware/errorHandler.js';
import * as socketService from './socket.service.js';
import { printBillBon } from '../printer/templates.js';

export function getTableSummary(tableId: number) {
  const db = getDb();

  // Get all order items with remaining (not yet billed) quantity for this table
  const items = db.prepare(`
    SELECT oi.id, oi.order_id, oi.menu_item_id,
           (oi.quantity - COALESCE((SELECT SUM(quantity) FROM bill_items WHERE order_item_id = oi.id), 0)) AS quantity,
           oi.unit_price, oi.notes, oi.status,
           mi.name as item_name, mc.name as category_name, mc.target as category_target,
           o.created_at as order_created_at
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    JOIN menu_items mi ON oi.menu_item_id = mi.id
    JOIN menu_categories mc ON mi.category_id = mc.id
    WHERE o.table_id = ?
      AND o.status IN ('offen', 'in_bearbeitung', 'fertig', 'serviert')
      AND oi.status != 'storniert'
      AND oi.quantity > COALESCE((SELECT SUM(quantity) FROM bill_items WHERE order_item_id = oi.id), 0)
    ORDER BY o.created_at, oi.created_at
  `).all(tableId) as any[];

  const subtotal = items.reduce((sum: number, item: any) => sum + (item.unit_price * item.quantity), 0);

  return {
    table_id: tableId,
    items,
    subtotal: Math.round(subtotal * 100) / 100,
  };
}

export function settleTable(
  tableId: number,
  waiterId: number,
  data: {
    discount_type?: string | null;
    discount_value?: number;
    notes?: string | null;
    print_bon?: boolean;
  }
) {
  const db = getDb();
  const summary = getTableSummary(tableId);

  if (summary.items.length === 0) {
    throw new AppError(400, 'Keine offenen Posten für diesen Tisch');
  }

  let total = summary.subtotal;
  const discountType = data.discount_type || null;
  const discountValue = data.discount_value || 0;

  if (discountType === 'percentage') {
    total = total - (total * discountValue / 100);
  } else if (discountType === 'fixed') {
    total = total - discountValue;
  }
  total = Math.round(Math.max(0, total) * 100) / 100;

  const result = db.transaction(() => {
    // Create bill
    const billResult = db.prepare(`
      INSERT INTO bills (table_id, waiter_id, subtotal, discount_type, discount_value, total, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(tableId, waiterId, summary.subtotal, discountType, discountValue, total, data.notes || null);

    const billId = billResult.lastInsertRowid as number;

    // Create bill items
    const insertBillItem = db.prepare(
      'INSERT INTO bill_items (bill_id, order_item_id, quantity, unit_price) VALUES (?, ?, ?, ?)'
    );
    for (const item of summary.items) {
      insertBillItem.run(billId, item.id, item.quantity, item.unit_price);
    }

    // Mark all orders for this table as serviert
    db.prepare(`
      UPDATE orders SET status = 'serviert', updated_at = datetime('now')
      WHERE table_id = ? AND status IN ('offen', 'in_bearbeitung', 'fertig')
    `).run(tableId);

    // Mark fully-billed order items as serviert (status only, not quantity)
    db.prepare(`
      UPDATE order_items SET status = 'serviert'
      WHERE order_id IN (SELECT id FROM orders WHERE table_id = ?)
        AND status != 'storniert'
        AND quantity <= COALESCE((SELECT SUM(quantity) FROM bill_items WHERE order_item_id = order_items.id), 0)
    `).run(tableId);

    return billId;
  })();

  const bill = db.prepare('SELECT * FROM bills WHERE id = ?').get(result) as any;

  socketService.emitBillSettled({ billId: result, tableId, total });

  if (data.print_bon) {
    const table = db.prepare('SELECT table_number FROM tables WHERE id = ?').get(tableId) as any;
    const waiter = db.prepare('SELECT display_name FROM users WHERE id = ?').get(waiterId) as any;
    printBillBon({
      tableNumber: table?.table_number || null,
      barSlot: null,
      waiterName: waiter?.display_name || '',
      items: summary.items.map((i: any) => ({ quantity: i.quantity, item_name: i.item_name, unit_price: i.unit_price })),
      subtotal: summary.subtotal,
      discountType: data.discount_type,
      discountValue: data.discount_value,
      total,
    });
  }

  return bill;
}

export function printBillForTable(tableId: number, waiterId: number) {
  const db = getDb();
  const summary = getTableSummary(tableId);
  if (summary.items.length === 0) {
    throw new AppError(400, 'Keine offenen Posten für diesen Tisch');
  }

  const table = db.prepare('SELECT table_number FROM tables WHERE id = ?').get(tableId) as any;
  const waiter = db.prepare('SELECT display_name FROM users WHERE id = ?').get(waiterId) as any;

  const ok = printBillBon({
    tableNumber: table?.table_number || null,
    barSlot: null,
    waiterName: waiter?.display_name || '',
    items: summary.items.map((i: any) => ({ quantity: i.quantity, item_name: i.item_name, unit_price: i.unit_price })),
    subtotal: summary.subtotal,
    discountType: null,
    discountValue: 0,
    total: summary.subtotal,
  });

  db.prepare(
    "UPDATE tables SET status = 'rechnung_angefordert', updated_at = datetime('now') WHERE id = ?"
  ).run(tableId);

  socketService.emitTableStatusChanged({
    tableId,
    tableNumber: table?.table_number,
    status: 'rechnung_angefordert',
  });

  return { printed: ok, subtotal: summary.subtotal };
}

export function settleItems(
  tableId: number,
  waiterId: number,
  requested: Array<{ order_item_id: number; quantity: number }>,
  data: {
    discount_type?: string | null;
    discount_value?: number;
    notes?: string | null;
    print_bon?: boolean;
  }
) {
  const db = getDb();

  // Aggregate requested quantities (in case the same id appears twice)
  const wanted = new Map<number, number>();
  for (const r of requested) {
    wanted.set(r.order_item_id, (wanted.get(r.order_item_id) ?? 0) + r.quantity);
  }
  const ids = Array.from(wanted.keys());
  const placeholders = ids.map(() => '?').join(',');

  // Load order items along with already-billed quantity
  const rows = db.prepare(`
    SELECT oi.id, oi.unit_price, oi.quantity AS total_quantity,
           COALESCE((SELECT SUM(quantity) FROM bill_items WHERE order_item_id = oi.id), 0) AS billed_quantity,
           mi.name AS item_name
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    JOIN menu_items mi ON oi.menu_item_id = mi.id
    WHERE oi.id IN (${placeholders})
      AND o.table_id = ?
      AND oi.status != 'storniert'
  `).all(...ids, tableId) as any[];

  if (rows.length === 0) {
    throw new AppError(400, 'Keine gueltigen Posten gefunden');
  }

  // Validate each requested quantity against the remaining
  const billable = rows.map((row: any) => {
    const reqQty = wanted.get(row.id)!;
    const remaining = row.total_quantity - row.billed_quantity;
    if (reqQty > remaining) {
      throw new AppError(400, `Position "${row.item_name}": angeforderte Menge ${reqQty} > offene Menge ${remaining}`);
    }
    return {
      order_item_id: row.id,
      quantity: reqQty,
      unit_price: row.unit_price,
      item_name: row.item_name,
      fully_billed: row.billed_quantity + reqQty >= row.total_quantity,
    };
  });

  const subtotal = billable.reduce((s, i) => s + i.unit_price * i.quantity, 0);
  let total = Math.round(subtotal * 100) / 100;

  const discountType = data.discount_type || null;
  const discountValue = data.discount_value || 0;

  if (discountType === 'percentage') {
    total = total - (total * discountValue / 100);
  } else if (discountType === 'fixed') {
    total = total - discountValue;
  }
  total = Math.round(Math.max(0, total) * 100) / 100;

  const billId = db.transaction(() => {
    const billResult = db.prepare(`
      INSERT INTO bills (table_id, waiter_id, subtotal, discount_type, discount_value, total, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(tableId, waiterId, subtotal, discountType, discountValue, total, data.notes || null);

    const id = billResult.lastInsertRowid as number;

    const insertBillItem = db.prepare(
      'INSERT INTO bill_items (bill_id, order_item_id, quantity, unit_price) VALUES (?, ?, ?, ?)'
    );
    const markServiert = db.prepare("UPDATE order_items SET status = 'serviert' WHERE id = ?");
    for (const item of billable) {
      insertBillItem.run(id, item.order_item_id, item.quantity, item.unit_price);
      if (item.fully_billed) markServiert.run(item.order_item_id);
    }

    return id;
  })();

  if (data.print_bon) {
    const table = db.prepare('SELECT table_number FROM tables WHERE id = ?').get(tableId) as any;
    const waiter = db.prepare('SELECT display_name FROM users WHERE id = ?').get(waiterId) as any;
    printBillBon({
      tableNumber: table?.table_number || null,
      barSlot: null,
      waiterName: waiter?.display_name || '',
      items: billable.map(i => ({ quantity: i.quantity, item_name: i.item_name, unit_price: i.unit_price })),
      subtotal,
      discountType,
      discountValue,
      total,
    });
  }

  return db.prepare('SELECT * FROM bills WHERE id = ?').get(billId);
}

// --- Order-based billing (for bar orders without table) ---

export function getOrderSummary(orderId: number) {
  const db = getDb();
  const order = db.prepare(`
    SELECT o.*, u.display_name as waiter_name
    FROM orders o JOIN users u ON o.waiter_id = u.id
    WHERE o.id = ?
  `).get(orderId) as any;
  if (!order) throw new AppError(404, 'Bestellung nicht gefunden');

  const items = db.prepare(`
    SELECT oi.id, oi.order_id, oi.menu_item_id,
           (oi.quantity - COALESCE((SELECT SUM(quantity) FROM bill_items WHERE order_item_id = oi.id), 0)) AS quantity,
           oi.unit_price, oi.notes, oi.status,
           mi.name as item_name, mc.name as category_name
    FROM order_items oi
    JOIN menu_items mi ON oi.menu_item_id = mi.id
    JOIN menu_categories mc ON mi.category_id = mc.id
    WHERE oi.order_id = ? AND oi.status != 'storniert'
      AND oi.quantity > COALESCE((SELECT SUM(quantity) FROM bill_items WHERE order_item_id = oi.id), 0)
  `).all(orderId) as any[];

  const subtotal = items.reduce((sum: number, item: any) => sum + (item.unit_price * item.quantity), 0);

  return { order_id: orderId, waiter_name: order.waiter_name, items, subtotal: Math.round(subtotal * 100) / 100 };
}

export function settleOrder(
  orderId: number,
  waiterId: number,
  data: { discount_type?: string | null; discount_value?: number; notes?: string | null; print_bon?: boolean }
) {
  const db = getDb();
  const summary = getOrderSummary(orderId);
  if (summary.items.length === 0) throw new AppError(400, 'Keine offenen Posten');

  let total = summary.subtotal;
  const discountType = data.discount_type || null;
  const discountValue = data.discount_value || 0;
  if (discountType === 'percentage') total -= total * discountValue / 100;
  else if (discountType === 'fixed') total -= discountValue;
  total = Math.round(Math.max(0, total) * 100) / 100;

  const order = db.prepare('SELECT table_id FROM orders WHERE id = ?').get(orderId) as any;

  const billId = db.transaction(() => {
    const billResult = db.prepare(
      'INSERT INTO bills (table_id, waiter_id, subtotal, discount_type, discount_value, total, notes) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(order.table_id, waiterId, summary.subtotal, discountType, discountValue, total, data.notes || null);
    const id = billResult.lastInsertRowid as number;

    const ins = db.prepare('INSERT INTO bill_items (bill_id, order_item_id, quantity, unit_price) VALUES (?, ?, ?, ?)');
    for (const item of summary.items) ins.run(id, item.id, item.quantity, item.unit_price);

    db.prepare("UPDATE orders SET status = 'serviert', updated_at = datetime('now') WHERE id = ?").run(orderId);
    db.prepare("UPDATE order_items SET status = 'serviert' WHERE order_id = ? AND status != 'storniert'").run(orderId);

    return id;
  })();

  socketService.emitBillSettled({ billId, orderId, total });

  // Print bill bon only if explicitly requested (Barverkauf: nicht automatisch)
  if (data.print_bon) {
    const waiter = db.prepare('SELECT display_name FROM users WHERE id = ?').get(waiterId) as any;
    const orderData = db.prepare('SELECT bar_slot FROM orders WHERE id = ?').get(orderId) as any;
    printBillBon({
      tableNumber: null,
      barSlot: orderData?.bar_slot || null,
      waiterName: waiter?.display_name || '',
      items: summary.items.map((i: any) => ({ quantity: i.quantity, item_name: i.item_name, unit_price: i.unit_price })),
      subtotal: summary.subtotal,
      discountType: data.discount_type,
      discountValue: data.discount_value,
      total,
    });
  }

  return db.prepare('SELECT * FROM bills WHERE id = ?').get(billId);
}

export function listBills(filters?: { date?: string; waiter_id?: number }) {
  const db = getDb();
  let query = `
    SELECT b.*, u.display_name as waiter_name, t.table_number
    FROM bills b
    JOIN users u ON b.waiter_id = u.id
    LEFT JOIN tables t ON b.table_id = t.id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (filters?.date) {
    query += ' AND DATE(b.created_at) = ?';
    params.push(filters.date);
  }
  if (filters?.waiter_id) {
    query += ' AND b.waiter_id = ?';
    params.push(filters.waiter_id);
  }

  query += ' ORDER BY b.created_at DESC';
  return db.prepare(query).all(...params);
}

export function getBill(id: number) {
  const db = getDb();
  const bill = db.prepare(`
    SELECT b.*, u.display_name as waiter_name, t.table_number
    FROM bills b
    JOIN users u ON b.waiter_id = u.id
    LEFT JOIN tables t ON b.table_id = t.id
    WHERE b.id = ?
  `).get(id) as any;

  if (!bill) throw new AppError(404, 'Rechnung nicht gefunden');

  const items = db.prepare(`
    SELECT bi.*, mi.name as item_name
    FROM bill_items bi
    JOIN order_items oi ON bi.order_item_id = oi.id
    JOIN menu_items mi ON oi.menu_item_id = mi.id
    WHERE bi.bill_id = ?
  `).all(id);

  return { ...bill, items };
}

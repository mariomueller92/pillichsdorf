import { queryOne, queryAll, withTransaction } from '../database.js';
import { AppError } from '../middleware/errorHandler.js';
import { printBillBon } from '../printer/templates.js';
import { JetonBreakdownEntry } from '../shared/types.js';

export const JETON_ITEM_JOIN = `LEFT JOIN jeton_types jt ON mi.jeton_type_id = jt.id`;
export const JETON_ITEM_COLUMNS = `mi.jeton_type_id, jt.name AS jeton_name, jt.color AS jeton_color, jt.value AS jeton_value`;

interface JetonEquivalentInput {
  quantity: number;
  unit_price: number;
  jeton_type_id: number | null;
  jeton_name?: string | null;
  jeton_color?: string | null;
  jeton_value?: number | null;
}

function computeJetonEquivalent(items: JetonEquivalentInput[]) {
  let subtotal = 0;
  const byColor = new Map<number, JetonBreakdownEntry>();
  let unassignedEur = 0;
  let unassignedCount = 0;

  for (const it of items) {
    if (it.jeton_type_id != null && it.jeton_value != null) {
      const lineEur = it.jeton_value * it.quantity;
      subtotal += lineEur;
      const entry = byColor.get(it.jeton_type_id) ?? {
        jeton_type_id: it.jeton_type_id,
        name: it.jeton_name || '',
        color: it.jeton_color || '',
        value: it.jeton_value,
        count: 0,
        subtotal_eur: 0,
      };
      entry.count += it.quantity;
      entry.subtotal_eur = Math.round((entry.subtotal_eur + lineEur) * 100) / 100;
      byColor.set(it.jeton_type_id, entry);
    } else {
      const lineEur = it.unit_price * it.quantity;
      subtotal += lineEur;
      unassignedEur += lineEur;
      unassignedCount += it.quantity;
    }
  }

  return {
    subtotal: Math.round(subtotal * 100) / 100,
    breakdown: Array.from(byColor.values()),
    unassigned: unassignedCount > 0 ? { count: unassignedCount, eur: Math.round(unassignedEur * 100) / 100 } : null,
  };
}

async function getWaiterPaymentMode(waiterId: number): Promise<'bargeld' | 'jeton'> {
  const waiter = await queryOne<{ payment_mode: string }>('SELECT payment_mode FROM users WHERE id = ?', [waiterId]);
  return waiter?.payment_mode === 'jeton' ? 'jeton' : 'bargeld';
}

export async function getTableSummary(tableId: number) {
  // Get all order items with remaining (not yet billed) quantity for this table
  const items = await queryAll<any>(`
    SELECT oi.id, oi.order_id, oi.menu_item_id,
           (oi.quantity - COALESCE((SELECT SUM(quantity) FROM bill_items WHERE order_item_id = oi.id), 0)) AS quantity,
           oi.unit_price, oi.notes, oi.status,
           mi.name as item_name, mc.name as category_name, mc.target as category_target,
           ${JETON_ITEM_COLUMNS},
           o.created_at as order_created_at
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    JOIN menu_items mi ON oi.menu_item_id = mi.id
    JOIN menu_categories mc ON mi.category_id = mc.id
    ${JETON_ITEM_JOIN}
    WHERE o.table_id = ?
      AND o.status IN ('offen', 'in_bearbeitung', 'fertig', 'serviert')
      AND oi.status != 'storniert'
      AND oi.quantity > COALESCE((SELECT SUM(quantity) FROM bill_items WHERE order_item_id = oi.id), 0)
    ORDER BY o.created_at, oi.created_at
  `, [tableId]);

  const subtotal = items.reduce((sum: number, item: any) => sum + (item.unit_price * item.quantity), 0);
  const jeton = computeJetonEquivalent(items);

  return {
    table_id: tableId,
    items,
    subtotal: Math.round(subtotal * 100) / 100,
    jeton_breakdown: jeton.breakdown,
    jeton_unassigned: jeton.unassigned,
  };
}

export async function settleTable(
  tableId: number,
  waiterId: number,
  data: {
    discount_type?: string | null;
    discount_value?: number;
    notes?: string | null;
    print_bon?: boolean;
  }
) {
  const summary = await getTableSummary(tableId);

  if (summary.items.length === 0) {
    throw new AppError(400, 'Keine offenen Posten für diesen Tisch');
  }

  const paymentMode = await getWaiterPaymentMode(waiterId);
  const jeton = paymentMode === 'jeton' ? computeJetonEquivalent(summary.items) : null;
  const baseSubtotal = jeton ? jeton.subtotal : summary.subtotal;

  let total = baseSubtotal;
  const discountType = data.discount_type || null;
  const discountValue = data.discount_value || 0;

  if (discountType === 'percentage') {
    total = total - (total * discountValue / 100);
  } else if (discountType === 'fixed') {
    total = total - discountValue;
  }
  total = Math.round(Math.max(0, total) * 100) / 100;

  const billId = await withTransaction(async (tx) => {
    // Create bill
    const billRow = await tx.queryOne<{ id: number }>(`
      INSERT INTO bills (table_id, waiter_id, subtotal, discount_type, discount_value, total, payment_mode, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id
    `, [tableId, waiterId, baseSubtotal, discountType, discountValue, total, paymentMode, data.notes || null]);

    const id = billRow!.id;

    // Create bill items
    for (const item of summary.items) {
      await tx.execute(
        'INSERT INTO bill_items (bill_id, order_item_id, quantity, unit_price) VALUES (?, ?, ?, ?)',
        [id, item.id, item.quantity, item.unit_price]
      );
    }

    // Mark all orders for this table as serviert
    await tx.execute(`
      UPDATE orders SET status = 'serviert', updated_at = now()
      WHERE table_id = ? AND status IN ('offen', 'in_bearbeitung', 'fertig')
    `, [tableId]);

    // Mark fully-billed order items as serviert (status only, not quantity)
    await tx.execute(`
      UPDATE order_items SET status = 'serviert'
      WHERE order_id IN (SELECT id FROM orders WHERE table_id = ?)
        AND status != 'storniert'
        AND quantity <= COALESCE((SELECT SUM(quantity) FROM bill_items WHERE order_item_id = order_items.id), 0)
    `, [tableId]);

    return id;
  });

  const bill = await queryOne<any>('SELECT * FROM bills WHERE id = ?', [billId]);

  if (data.print_bon) {
    const table = await queryOne<{ table_number: string }>('SELECT table_number FROM tables WHERE id = ?', [tableId]);
    const waiter = await queryOne<{ display_name: string }>('SELECT display_name FROM users WHERE id = ?', [waiterId]);
    await printBillBon({
      tableNumber: table?.table_number || null,
      barSlot: null,
      waiterName: waiter?.display_name || '',
      items: summary.items.map((i: any) => ({ quantity: i.quantity, item_name: i.item_name, unit_price: i.unit_price })),
      subtotal: baseSubtotal,
      discountType: data.discount_type,
      discountValue: data.discount_value,
      total,
      paymentMode,
      jetonBreakdown: jeton?.breakdown.map(b => ({ name: b.name, color: b.color, count: b.count })),
      jetonUnassigned: jeton?.unassigned ?? null,
    });
  }

  return { ...bill, jeton_breakdown: jeton?.breakdown ?? null, jeton_unassigned: jeton?.unassigned ?? null };
}

export async function printBillForTable(tableId: number, waiterId: number) {
  const summary = await getTableSummary(tableId);
  if (summary.items.length === 0) {
    throw new AppError(400, 'Keine offenen Posten für diesen Tisch');
  }

  const paymentMode = await getWaiterPaymentMode(waiterId);
  const jeton = paymentMode === 'jeton' ? computeJetonEquivalent(summary.items) : null;
  const baseSubtotal = jeton ? jeton.subtotal : summary.subtotal;

  const table = await queryOne<{ table_number: string }>('SELECT table_number FROM tables WHERE id = ?', [tableId]);
  const waiter = await queryOne<{ display_name: string }>('SELECT display_name FROM users WHERE id = ?', [waiterId]);

  const ok = await printBillBon({
    tableNumber: table?.table_number || null,
    barSlot: null,
    waiterName: waiter?.display_name || '',
    items: summary.items.map((i: any) => ({ quantity: i.quantity, item_name: i.item_name, unit_price: i.unit_price })),
    subtotal: baseSubtotal,
    discountType: null,
    discountValue: 0,
    total: baseSubtotal,
    paymentMode,
    jetonBreakdown: jeton?.breakdown.map(b => ({ name: b.name, color: b.color, count: b.count })),
    jetonUnassigned: jeton?.unassigned ?? null,
  });

  return { printed: ok, subtotal: baseSubtotal };
}

export async function settleItems(
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
  // Aggregate requested quantities (in case the same id appears twice)
  const wanted = new Map<number, number>();
  for (const r of requested) {
    wanted.set(r.order_item_id, (wanted.get(r.order_item_id) ?? 0) + r.quantity);
  }
  const ids = Array.from(wanted.keys());
  const placeholders = ids.map(() => '?').join(',');

  // Load order items along with already-billed quantity
  const rows = await queryAll<any>(`
    SELECT oi.id, oi.unit_price, oi.quantity AS total_quantity,
           COALESCE((SELECT SUM(quantity) FROM bill_items WHERE order_item_id = oi.id), 0) AS billed_quantity,
           mi.name AS item_name,
           ${JETON_ITEM_COLUMNS}
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    JOIN menu_items mi ON oi.menu_item_id = mi.id
    ${JETON_ITEM_JOIN}
    WHERE oi.id IN (${placeholders})
      AND o.table_id = ?
      AND oi.status != 'storniert'
  `, [...ids, tableId]);

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
      jeton_type_id: row.jeton_type_id,
      jeton_name: row.jeton_name,
      jeton_color: row.jeton_color,
      jeton_value: row.jeton_value,
      fully_billed: row.billed_quantity + reqQty >= row.total_quantity,
    };
  });

  const paymentMode = await getWaiterPaymentMode(waiterId);
  const jeton = paymentMode === 'jeton' ? computeJetonEquivalent(billable) : null;
  const nominalSubtotal = billable.reduce((s, i) => s + i.unit_price * i.quantity, 0);
  const baseSubtotal = jeton ? jeton.subtotal : Math.round(nominalSubtotal * 100) / 100;

  let total = baseSubtotal;

  const discountType = data.discount_type || null;
  const discountValue = data.discount_value || 0;

  if (discountType === 'percentage') {
    total = total - (total * discountValue / 100);
  } else if (discountType === 'fixed') {
    total = total - discountValue;
  }
  total = Math.round(Math.max(0, total) * 100) / 100;

  const billId = await withTransaction(async (tx) => {
    const billRow = await tx.queryOne<{ id: number }>(`
      INSERT INTO bills (table_id, waiter_id, subtotal, discount_type, discount_value, total, payment_mode, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id
    `, [tableId, waiterId, baseSubtotal, discountType, discountValue, total, paymentMode, data.notes || null]);

    const id = billRow!.id;

    for (const item of billable) {
      await tx.execute(
        'INSERT INTO bill_items (bill_id, order_item_id, quantity, unit_price) VALUES (?, ?, ?, ?)',
        [id, item.order_item_id, item.quantity, item.unit_price]
      );
      if (item.fully_billed) {
        await tx.execute("UPDATE order_items SET status = 'serviert' WHERE id = ?", [item.order_item_id]);
      }
    }

    return id;
  });

  if (data.print_bon) {
    const table = await queryOne<{ table_number: string }>('SELECT table_number FROM tables WHERE id = ?', [tableId]);
    const waiter = await queryOne<{ display_name: string }>('SELECT display_name FROM users WHERE id = ?', [waiterId]);
    await printBillBon({
      tableNumber: table?.table_number || null,
      barSlot: null,
      waiterName: waiter?.display_name || '',
      items: billable.map(i => ({ quantity: i.quantity, item_name: i.item_name, unit_price: i.unit_price })),
      subtotal: baseSubtotal,
      discountType,
      discountValue,
      total,
      paymentMode,
      jetonBreakdown: jeton?.breakdown.map(b => ({ name: b.name, color: b.color, count: b.count })),
      jetonUnassigned: jeton?.unassigned ?? null,
    });
  }

  const bill = await queryOne<any>('SELECT * FROM bills WHERE id = ?', [billId]);
  return { ...bill, jeton_breakdown: jeton?.breakdown ?? null, jeton_unassigned: jeton?.unassigned ?? null };
}

// --- Order-based billing (for bar orders without table) ---

export async function getOrderSummary(orderId: number) {
  const order = await queryOne<any>(`
    SELECT o.*, u.display_name as waiter_name
    FROM orders o JOIN users u ON o.waiter_id = u.id
    WHERE o.id = ?
  `, [orderId]);
  if (!order) throw new AppError(404, 'Bestellung nicht gefunden');

  const items = await queryAll<any>(`
    SELECT oi.id, oi.order_id, oi.menu_item_id,
           (oi.quantity - COALESCE((SELECT SUM(quantity) FROM bill_items WHERE order_item_id = oi.id), 0)) AS quantity,
           oi.unit_price, oi.notes, oi.status,
           mi.name as item_name, mc.name as category_name,
           ${JETON_ITEM_COLUMNS}
    FROM order_items oi
    JOIN menu_items mi ON oi.menu_item_id = mi.id
    JOIN menu_categories mc ON mi.category_id = mc.id
    ${JETON_ITEM_JOIN}
    WHERE oi.order_id = ? AND oi.status != 'storniert'
      AND oi.quantity > COALESCE((SELECT SUM(quantity) FROM bill_items WHERE order_item_id = oi.id), 0)
  `, [orderId]);

  const subtotal = items.reduce((sum: number, item: any) => sum + (item.unit_price * item.quantity), 0);
  const jeton = computeJetonEquivalent(items);

  return {
    order_id: orderId,
    waiter_name: order.waiter_name,
    items,
    subtotal: Math.round(subtotal * 100) / 100,
    jeton_breakdown: jeton.breakdown,
    jeton_unassigned: jeton.unassigned,
  };
}

export async function settleOrder(
  orderId: number,
  waiterId: number,
  data: { discount_type?: string | null; discount_value?: number; notes?: string | null; print_bon?: boolean }
) {
  const summary = await getOrderSummary(orderId);
  if (summary.items.length === 0) throw new AppError(400, 'Keine offenen Posten');

  const paymentMode = await getWaiterPaymentMode(waiterId);
  const jeton = paymentMode === 'jeton' ? computeJetonEquivalent(summary.items) : null;
  const baseSubtotal = jeton ? jeton.subtotal : summary.subtotal;

  let total = baseSubtotal;
  const discountType = data.discount_type || null;
  const discountValue = data.discount_value || 0;
  if (discountType === 'percentage') total -= total * discountValue / 100;
  else if (discountType === 'fixed') total -= discountValue;
  total = Math.round(Math.max(0, total) * 100) / 100;

  const order = await queryOne<{ table_id: number | null }>('SELECT table_id FROM orders WHERE id = ?', [orderId]);

  const billId = await withTransaction(async (tx) => {
    const billRow = await tx.queryOne<{ id: number }>(
      'INSERT INTO bills (table_id, waiter_id, subtotal, discount_type, discount_value, total, payment_mode, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id',
      [order!.table_id, waiterId, baseSubtotal, discountType, discountValue, total, paymentMode, data.notes || null]
    );
    const id = billRow!.id;

    for (const item of summary.items) {
      await tx.execute(
        'INSERT INTO bill_items (bill_id, order_item_id, quantity, unit_price) VALUES (?, ?, ?, ?)',
        [id, item.id, item.quantity, item.unit_price]
      );
    }

    await tx.execute("UPDATE orders SET status = 'serviert', updated_at = now() WHERE id = ?", [orderId]);
    await tx.execute("UPDATE order_items SET status = 'serviert' WHERE order_id = ? AND status != 'storniert'", [orderId]);

    return id;
  });

  // Print bill bon only if explicitly requested (Barverkauf: nicht automatisch)
  if (data.print_bon) {
    const waiter = await queryOne<{ display_name: string }>('SELECT display_name FROM users WHERE id = ?', [waiterId]);
    const orderData = await queryOne<{ bar_slot: string | null }>('SELECT bar_slot FROM orders WHERE id = ?', [orderId]);
    await printBillBon({
      tableNumber: null,
      barSlot: orderData?.bar_slot || null,
      waiterName: waiter?.display_name || '',
      items: summary.items.map((i: any) => ({ quantity: i.quantity, item_name: i.item_name, unit_price: i.unit_price })),
      subtotal: baseSubtotal,
      discountType: data.discount_type,
      discountValue: data.discount_value,
      total,
      paymentMode,
      jetonBreakdown: jeton?.breakdown.map(b => ({ name: b.name, color: b.color, count: b.count })),
      jetonUnassigned: jeton?.unassigned ?? null,
    });
  }

  const bill = await queryOne<any>('SELECT * FROM bills WHERE id = ?', [billId]);
  return { ...bill, jeton_breakdown: jeton?.breakdown ?? null, jeton_unassigned: jeton?.unassigned ?? null };
}

export async function listBills(filters?: { date?: string; waiter_id?: number }) {
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
  return queryAll(query, params);
}

export async function getBill(id: number) {
  const bill = await queryOne<any>(`
    SELECT b.*, u.display_name as waiter_name, t.table_number
    FROM bills b
    JOIN users u ON b.waiter_id = u.id
    LEFT JOIN tables t ON b.table_id = t.id
    WHERE b.id = ?
  `, [id]);

  if (!bill) throw new AppError(404, 'Rechnung nicht gefunden');

  const items = await queryAll<any>(`
    SELECT bi.*, mi.name as item_name,
           ${JETON_ITEM_COLUMNS}
    FROM bill_items bi
    JOIN order_items oi ON bi.order_item_id = oi.id
    JOIN menu_items mi ON oi.menu_item_id = mi.id
    ${JETON_ITEM_JOIN}
    WHERE bi.bill_id = ?
  `, [id]);

  if (bill.payment_mode === 'jeton') {
    const jeton = computeJetonEquivalent(items);
    return { ...bill, items, jeton_breakdown: jeton.breakdown, jeton_unassigned: jeton.unassigned };
  }

  return { ...bill, items };
}

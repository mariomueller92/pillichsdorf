import { queryOne, queryAll, execute, withTransaction } from '../database.js';

type Range = { from?: string | null; to?: string | null };

function billsRange(r: Range) {
  const where: string[] = [];
  const params: any[] = [];
  if (r.from) { where.push('b.created_at >= ?'); params.push(r.from); }
  if (r.to)   { where.push('b.created_at < ?');  params.push(r.to); }
  return { clause: where.length ? 'WHERE ' + where.join(' AND ') : '', params };
}

function ordersRange(r: Range, alias: string = 'o') {
  const where: string[] = [];
  const params: any[] = [];
  if (r.from) { where.push(`${alias}.created_at >= ?`); params.push(r.from); }
  if (r.to)   { where.push(`${alias}.created_at < ?`);  params.push(r.to); }
  return { clause: where.join(' AND '), params };
}

export async function getSummary(r: Range) {
  const b = billsRange(r);
  const billSum = await queryOne<any>(`
    SELECT
      COALESCE(SUM(b.total), 0) as revenue,
      COUNT(*) as bill_count,
      COALESCE(AVG(b.total), 0) as avg_bill
    FROM bills b ${b.clause}
  `, b.params);

  const o = ordersRange(r);
  const clause = o.clause ? `AND ${o.clause}` : '';
  const orderSum = await queryOne<any>(`
    SELECT COUNT(*) as order_count
    FROM orders o
    WHERE o.status != 'storniert' ${clause}
  `, o.params);

  const itemSum = await queryOne<any>(`
    SELECT COALESCE(SUM(oi.quantity), 0) as item_count
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    WHERE oi.status != 'storniert' AND o.status != 'storniert' ${clause}
  `, o.params);

  return {
    revenue: Number(billSum!.revenue) || 0,
    bill_count: Number(billSum!.bill_count) || 0,
    avg_bill: Number(billSum!.avg_bill) || 0,
    order_count: Number(orderSum!.order_count) || 0,
    item_count: Number(itemSum!.item_count) || 0,
  };
}

export async function getTopItems(r: Range, limit: number = 10) {
  const o = ordersRange(r);
  const clause = o.clause ? `AND ${o.clause}` : '';
  return queryAll(`
    SELECT mi.id as menu_item_id,
           mi.name as item_name,
           mc.name as category_name,
           SUM(oi.quantity) as total_quantity,
           COUNT(DISTINCT oi.order_id) as order_count
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    JOIN menu_items mi ON oi.menu_item_id = mi.id
    JOIN menu_categories mc ON mi.category_id = mc.id
    WHERE oi.status != 'storniert' ${clause}
    GROUP BY mi.id
    ORDER BY total_quantity DESC
    LIMIT ?
  `, [...o.params, limit]);
}

export async function getOrdersByWaiter(r: Range) {
  const o = ordersRange(r);
  const clause = o.clause ? `AND ${o.clause}` : '';
  return queryAll(`
    SELECT u.id as waiter_id,
           u.display_name as waiter_name,
           COUNT(DISTINCT o.id) as order_count,
           COALESCE(SUM(CASE WHEN oi.status != 'storniert' THEN oi.quantity ELSE 0 END), 0) as item_count
    FROM orders o
    JOIN users u ON o.waiter_id = u.id
    LEFT JOIN order_items oi ON oi.order_id = o.id
    WHERE o.status != 'storniert' ${clause}
    GROUP BY u.id
    ORDER BY order_count DESC
  `, o.params);
}

export async function getOrdersByCategory(r: Range) {
  const o = ordersRange(r);
  const clause = o.clause ? `AND ${o.clause}` : '';
  return queryAll(`
    SELECT mc.id as category_id,
           mc.name as category_name,
           mc.target as category_target,
           SUM(oi.quantity) as item_count
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    JOIN menu_items mi ON oi.menu_item_id = mi.id
    JOIN menu_categories mc ON mi.category_id = mc.id
    WHERE oi.status != 'storniert' AND o.status != 'storniert' ${clause}
    GROUP BY mc.id
    ORDER BY item_count DESC
  `, o.params);
}

export async function getJetonTotals(r: Range) {
  const b = billsRange(r);
  const clause = b.clause ? `${b.clause} AND b.payment_mode = 'jeton'` : `WHERE b.payment_mode = 'jeton'`;
  return queryAll(`
    SELECT jt.id as jeton_type_id,
           jt.name,
           jt.color,
           jt.value,
           SUM(bi.quantity) as count,
           ROUND((SUM(bi.quantity) * jt.value)::numeric, 2) as subtotal_eur
    FROM bill_items bi
    JOIN order_items oi ON bi.order_item_id = oi.id
    JOIN menu_items mi ON oi.menu_item_id = mi.id
    JOIN jeton_types jt ON mi.jeton_type_id = jt.id
    JOIN bills b ON bi.bill_id = b.id
    ${clause}
    GROUP BY jt.id
    ORDER BY jt.sort_order, jt.name
  `, b.params);
}

/**
 * Löscht alle historischen Auftrags- & Abrechnungsdaten.
 * Setzt auch alle Tische auf "frei" und beendet laufende Bar-Slots.
 * Menü, Benutzer und Tische (Stammdaten) bleiben erhalten.
 */
export async function resetAll() {
  return withTransaction(async (tx) => {
    const billItems = (await tx.execute('DELETE FROM bill_items')).rowCount;
    const bills = (await tx.execute('DELETE FROM bills')).rowCount;
    const orderItems = (await tx.execute('DELETE FROM order_items')).rowCount;
    const orders = (await tx.execute('DELETE FROM orders')).rowCount;
    await tx.execute("UPDATE tables SET status = 'frei', merged_into_id = NULL, updated_at = now()");
    return { bills, bill_items: billItems, orders, order_items: orderItems };
  });
}

export async function getStatsBundle(r: Range, topLimit: number = 10) {
  const [summary, top_items, by_waiter, by_category, jeton_totals] = await Promise.all([
    getSummary(r),
    getTopItems(r, topLimit),
    getOrdersByWaiter(r),
    getOrdersByCategory(r),
    getJetonTotals(r),
  ]);
  return { summary, top_items, by_waiter, by_category, jeton_totals };
}

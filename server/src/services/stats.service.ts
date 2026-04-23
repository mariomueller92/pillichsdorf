import { getDb } from '../database.js';

type Range = { from?: string | null; to?: string | null };

function billsRange(r: Range) {
  const where: string[] = [];
  const params: any[] = [];
  if (r.from) { where.push('b.created_at >= ?'); params.push(toSqliteUtc(r.from)); }
  if (r.to)   { where.push('b.created_at < ?');  params.push(toSqliteUtc(r.to)); }
  return { clause: where.length ? 'WHERE ' + where.join(' AND ') : '', params };
}

function ordersRange(r: Range, alias: string = 'o') {
  const where: string[] = [];
  const params: any[] = [];
  if (r.from) { where.push(`${alias}.created_at >= ?`); params.push(toSqliteUtc(r.from)); }
  if (r.to)   { where.push(`${alias}.created_at < ?`);  params.push(toSqliteUtc(r.to)); }
  return { clause: where.join(' AND '), params };
}

function toSqliteUtc(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

export function getSummary(r: Range) {
  const db = getDb();
  const b = billsRange(r);
  const billSum = db.prepare(`
    SELECT
      COALESCE(SUM(b.total), 0) as revenue,
      COUNT(*) as bill_count,
      COALESCE(AVG(b.total), 0) as avg_bill
    FROM bills b ${b.clause}
  `).get(...b.params) as any;

  const o = ordersRange(r);
  const clause = o.clause ? `AND ${o.clause}` : '';
  const orderSum = db.prepare(`
    SELECT COUNT(*) as order_count
    FROM orders o
    WHERE o.status != 'storniert' ${clause}
  `).get(...o.params) as any;

  const itemSum = db.prepare(`
    SELECT COALESCE(SUM(oi.quantity), 0) as item_count
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    WHERE oi.status != 'storniert' AND o.status != 'storniert' ${clause}
  `).get(...o.params) as any;

  return {
    revenue: Number(billSum.revenue) || 0,
    bill_count: Number(billSum.bill_count) || 0,
    avg_bill: Number(billSum.avg_bill) || 0,
    order_count: Number(orderSum.order_count) || 0,
    item_count: Number(itemSum.item_count) || 0,
  };
}

export function getTopItems(r: Range, limit: number = 10) {
  const db = getDb();
  const o = ordersRange(r);
  const clause = o.clause ? `AND ${o.clause}` : '';
  return db.prepare(`
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
  `).all(...o.params, limit);
}

export function getOrdersByWaiter(r: Range) {
  const db = getDb();
  const o = ordersRange(r);
  const clause = o.clause ? `AND ${o.clause}` : '';
  return db.prepare(`
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
  `).all(...o.params);
}

export function getOrdersByCategory(r: Range) {
  const db = getDb();
  const o = ordersRange(r);
  const clause = o.clause ? `AND ${o.clause}` : '';
  return db.prepare(`
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
  `).all(...o.params);
}

/**
 * Löscht alle historischen Auftrags- & Abrechnungsdaten.
 * Setzt auch alle Tische auf "frei" und beendet laufende Bar-Slots.
 * Menü, Benutzer und Tische (Stammdaten) bleiben erhalten.
 */
export function resetAll() {
  const db = getDb();
  const result = db.transaction(() => {
    const billItems = db.prepare('DELETE FROM bill_items').run().changes;
    const bills = db.prepare('DELETE FROM bills').run().changes;
    const orderItems = db.prepare('DELETE FROM order_items').run().changes;
    const orders = db.prepare('DELETE FROM orders').run().changes;
    db.prepare("UPDATE tables SET status = 'frei', merged_into_id = NULL, updated_at = datetime('now')").run();
    return { bills, bill_items: billItems, orders, order_items: orderItems };
  })();
  return result;
}

export function getStatsBundle(r: Range, topLimit: number = 10) {
  return {
    summary: getSummary(r),
    top_items: getTopItems(r, topLimit),
    by_waiter: getOrdersByWaiter(r),
    by_category: getOrdersByCategory(r),
  };
}

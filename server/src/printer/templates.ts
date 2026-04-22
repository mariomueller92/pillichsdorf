import { buildReceipt, printRaw, isPrinterEnabled } from './index.js';

interface UnifiedBonItem {
  quantity: number;
  item_name: string;
  notes?: string | null;
  availability_mode: 'sofort' | 'lieferzeit';
}

interface UnifiedBonData {
  orderId: number;
  tableNumber: string | null;
  barSlot: string | null;
  waiterName: string;
  items: UnifiedBonItem[];
  notes?: string | null;
  createdAt: string;
}

interface BillBonData {
  tableNumber: string | null;
  barSlot: string | null;
  waiterName: string;
  items: Array<{ quantity: number; item_name: string; unit_price: number }>;
  subtotal: number;
  discountType?: string | null;
  discountValue?: number;
  total: number;
}

/**
 * Unified Order Bon:
 * - Top: SOFORT items (for bar/tray assembly)
 * - 15 blank lines (tear zone)
 * - Bottom: KUECHE items with EXTRA LARGE table number
 * - If no kitchen items: no tear zone, just sofort section
 */
export function printUnifiedBon(data: UnifiedBonData): boolean {
  if (!isPrinterEnabled()) return false;

  const time = new Date(data.createdAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  const date = new Date(data.createdAt).toLocaleDateString('de-DE');
  const tischLabel = data.tableNumber ? `Tisch ${data.tableNumber}` : (data.barSlot || 'BAR');

  const sofortItems = data.items.filter(i => i.availability_mode === 'sofort');
  const kuecheItems = data.items.filter(i => i.availability_mode === 'lieferzeit');

  const r = buildReceipt();

  const printHeader = () => {
    r.center().bold(true)
      .separator('=')
      .line(`BESTELLUNG #${String(data.orderId).padStart(4, '0')}`)
      .line(`${tischLabel} / ${time}`)
      .line(`Kellner: ${data.waiterName}`)
      .separator('=');
  };

  const printBigTable = () => {
    r.center().bold(true).big(true)
      .line(`*** ${tischLabel} ***`)
      .big(false).bold(false).left();
  };

  // === SOFORT section (always printed) ===
  printHeader();
  r.left().bold(true).line('--- SOFORT (Theke) ---').bold(false);
  r.feed(1);
  printBigTable();
  r.feed(1);

  if (sofortItems.length === 0) {
    r.line('  (keine)');
  } else {
    for (const item of sofortItems) {
      r.bold(true).line(`${item.quantity}x ${item.item_name}`);
      if (item.notes) {
        r.bold(false).line(`   -> ${item.notes}`);
      }
    }
  }
  r.bold(false);

  if (data.notes) {
    r.separator('-').line(`NOTIZ: ${data.notes}`);
  }

  // strichlierte Trennlinie zwischen Schank und Kueche
  r.line('- '.repeat(Math.floor(32 / 2)));

  // === KUECHE section (only if kitchen items exist) ===
  if (kuecheItems.length > 0) {
    // 15 blank lines as tear zone
    r.feed(15);

    printHeader();
    r.left().bold(true).line('--- KUECHE ---').bold(false);
    r.feed(1);
    printBigTable();
    r.feed(1);

    for (const item of kuecheItems) {
      r.bold(true).line(`${item.quantity}x ${item.item_name}`);
      if (item.notes) {
        r.bold(false).line(`   -> ${item.notes}`);
      }
    }
    r.bold(false);

    if (data.notes) {
      r.separator('-').line(`NOTIZ: ${data.notes}`);
    }

    r.separator('=');
  }

  r.feed(2).cut();

  const ok = printRaw(r.toString());
  if (ok) console.log(`[Drucker] Unified-Bon #${data.orderId} gedruckt (${sofortItems.length} sofort, ${kuecheItems.length} kueche)`);
  return ok;
}

/**
 * Bill Bon - printed when waiter clicks "Rechnung drucken"
 */
export function printBillBon(data: BillBonData): boolean {
  if (!isPrinterEnabled()) return false;

  const now = new Date();
  const tischLabel = data.tableNumber ? `Tisch ${data.tableNumber}` : (data.barSlot || 'BAR');
  const r = buildReceipt();

  r.center().bold(true)
    .separator('=')
    .line('WINZER PILLICHSDORF')
    .separator('=')
    .left().bold(false)
    .line(tischLabel)
    .line(`${now.toLocaleDateString('de-DE')}  ${now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`)
    .line(`Kellner: ${data.waiterName}`)
    .separator();

  for (const item of data.items) {
    const total = (item.unit_price * item.quantity).toFixed(2);
    r.row(`${item.quantity}x ${item.item_name}`, total);
  }

  r.separator()
    .row('Zwischensumme:', data.subtotal.toFixed(2));

  if (data.discountType && data.discountValue && data.discountValue > 0) {
    const label = data.discountType === 'percentage'
      ? `Rabatt (${data.discountValue}%):`
      : 'Rabatt:';
    const amount = data.discountType === 'percentage'
      ? (data.subtotal * data.discountValue / 100).toFixed(2)
      : data.discountValue.toFixed(2);
    r.row(label, `-${amount}`);
  }

  r.separator('=')
    .bold(true).big(true)
    .row('GESAMT:', `${data.total.toFixed(2)} EUR`)
    .bold(false).big(false)
    .separator('=')
    .center().line('Vielen Dank!')
    .feed(2).cut();

  const ok = printRaw(r.toString());
  if (ok) console.log('[Drucker] Abrechnungs-Bon gedruckt');
  return ok;
}

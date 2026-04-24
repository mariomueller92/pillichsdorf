import { buildReceipt, printRaw, isPrinterEnabled } from './index.js';
import { config } from '../config.js';

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
  splitPart?: { index: number; total: number } | null;
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
  splitPart?: { index: number; total: number } | null;
}

const CUT_MARK_LINE = '- - - - - - - - - - - - - - - -';

/**
 * Unified Order Bon:
 * - Top: SOFORT items (for bar/tray assembly)
 * - Tear zone with visible cut marks
 * - Bottom: KUECHE items with EXTRA LARGE table number
 */
export function printUnifiedBon(data: UnifiedBonData): boolean {
  if (!isPrinterEnabled()) return false;

  const time = new Date(data.createdAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Vienna' });
  const isBar = !data.tableNumber;
  const tischLabel = data.tableNumber ? `TISCH ${data.tableNumber}` : (data.barSlot ? `BAR ${data.barSlot}` : 'KEIN TISCH');
  const splitSuffix = data.splitPart ? ` (Teil ${data.splitPart.index}/${data.splitPart.total})` : '';

  const sofortItems = data.items.filter(i => i.availability_mode === 'sofort');
  const kuecheItems = data.items.filter(i => i.availability_mode === 'lieferzeit');

  const r = buildReceipt();

  const printBigTableHeader = () => {
    // Barverkauf bzw. Kein-Tisch: prominent an den Kopf
    if (isBar) {
      r.center().bold(true).huge(true)
        .line('BARVERKAUF')
        .huge(false).bold(false).left();
      if (data.barSlot) {
        r.center().bold(true).big(true).line(data.barSlot).big(false).bold(false).left();
      }
    } else {
      // Tischnummer sehr gross
      r.center().bold(true).quad(true)
        .line(`TISCH ${data.tableNumber}`)
        .quad(false).bold(false).left();
    }
  };

  const printHeader = (section: string) => {
    r.center().bold(true)
      .separator('=')
      .line(`BESTELLUNG #${String(data.orderId).padStart(4, '0')}${splitSuffix}`)
      .line(`${tischLabel}  ${time}`)
      .line(`Kellner: ${data.waiterName}`);
    r.big(true).line(section).big(false);
    r.separator('=').left().bold(false);
  };

  const printItems = (items: UnifiedBonItem[]) => {
    if (items.length === 0) {
      r.line('  (keine)');
      return;
    }
    for (const item of items) {
      // grössere Schrift für Positionen
      r.bold(true).big(true).line(`${item.quantity}x ${item.item_name}`).big(false).bold(false);
      if (item.notes) {
        r.line(`   -> ${item.notes}`);
      }
    }
  };

  // === SOFORT section ===
  printHeader('--- SOFORT (Theke) ---');
  printBigTableHeader();
  r.feed(1);
  printItems(sofortItems);

  if (data.notes) {
    r.separator('-').bold(true).line(`NOTIZ: ${data.notes}`).bold(false);
  }

  // === KUECHE section ===
  if (kuecheItems.length > 0) {
    // Abrisskante: sichtbar markiert, mehrere Leerzeilen, dann Markierung nochmal
    r.feed(2);
    r.center().line(CUT_MARK_LINE).line('>>>>  ABRISS  <<<<').line(CUT_MARK_LINE).left();
    r.feed(6);
    r.center().line(CUT_MARK_LINE).line('>>>>  ABRISS  <<<<').line(CUT_MARK_LINE).left();
    r.feed(2);

    printHeader('--- KÜCHE ---');
    printBigTableHeader();
    r.feed(1);
    printItems(kuecheItems);

    if (data.notes) {
      r.separator('-').bold(true).line(`NOTIZ: ${data.notes}`).bold(false);
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
  const isBar = !data.tableNumber;
  const tischLabel = data.tableNumber ? `TISCH ${data.tableNumber}` : (data.barSlot ? `BAR ${data.barSlot}` : 'KEIN TISCH');
  const splitSuffix = data.splitPart ? `  (Teil ${data.splitPart.index}/${data.splitPart.total})` : '';
  const r = buildReceipt();

  // Company header
  r.center().bold(true).big(true)
    .line(config.company.name)
    .big(false);
  if (config.company.address1) r.line(config.company.address1);
  if (config.company.address2) r.line(config.company.address2);
  if (config.company.betriebsnummer) r.line(`Betriebs-Nr.: ${config.company.betriebsnummer}`);
  r.bold(false).separator('=');

  // Barverkauf oder Tisch - gross oben
  if (isBar) {
    r.center().bold(true).huge(true).line('BARVERKAUF').huge(false).bold(false).left();
    if (data.barSlot) {
      r.center().big(true).line(data.barSlot).big(false).left();
    }
  } else {
    r.center().bold(true).quad(true).line(`TISCH ${data.tableNumber}`).quad(false).bold(false).left();
  }

  r.left()
    .line(`${now.toLocaleDateString('de-DE', { timeZone: 'Europe/Vienna' })}  ${now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Vienna' })}${splitSuffix}`)
    .line(`Kellner: ${data.waiterName}`)
    .separator();

  for (const item of data.items) {
    const total = (item.unit_price * item.quantity).toFixed(2);
    // grössere Schrift
    r.big(true).row(`${item.quantity}x ${item.item_name}`, total).big(false);
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
    .bold(true).huge(true)
    .row('GESAMT:', `${data.total.toFixed(2)} EUR`)
    .huge(false).bold(false)
    .separator('=')
    .center().line(config.company.footer)
    .feed(1)
    .line('Rainer Wein')
    .line('Weingut Zechmeister')
    .line('Boindlfeld')
    .line('2211 Pillichsdorf')
    .feed(1)
    .line('Powered by (c) MMUELLER')
    .feed(1);

  // Abrisskante am Ende
  r.center().line(CUT_MARK_LINE).line('>>>>  ABRISS  <<<<').line(CUT_MARK_LINE).left();
  r.feed(2).cut();

  const ok = printRaw(r.toString());
  if (ok) console.log('[Drucker] Abrechnungs-Bon gedruckt');
  return ok;
}

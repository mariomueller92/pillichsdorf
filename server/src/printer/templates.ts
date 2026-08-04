import { buildReceipt } from './receipt.js';
import { getSettings } from '../services/settings.service.js';
import { queuePrintJob } from '../services/printJobs.service.js';
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
  isReprint?: boolean;
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
  paymentMode?: 'bargeld' | 'jeton';
  jetonBreakdown?: Array<{ name: string; color: string; count: number }>;
  jetonUnassigned?: { count: number; eur: number } | null;
}

const CUT_MARK_LINE = '- - - - - - - - - - - - - - - -';

/**
 * Unified Order Bon:
 * - Top: SOFORT items (for bar/tray assembly)
 * - Tear zone with visible cut marks
 * - Bottom: KUECHE items with EXTRA LARGE table number
 *
 * Baut den Bon-Inhalt und legt ihn als print_jobs-Eintrag ab — die tatsaechliche
 * Druckausfuehrung uebernimmt der lokale Print-Agent (server/src/print-agent/agent.ts).
 */
export async function printUnifiedBon(data: UnifiedBonData): Promise<boolean> {
  if (!config.printer.enabled) return false;
  const settings = await getSettings();
  const time = new Date(data.createdAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Vienna' });
  const isBar = !data.tableNumber;
  const tischLabel = data.tableNumber ? `TISCH ${data.tableNumber}` : (data.barSlot ? `BAR ${data.barSlot}` : 'KEIN TISCH');
  const splitSuffix = data.splitPart ? ` (Teil ${data.splitPart.index}/${data.splitPart.total})` : '';

  const sofortItems = data.items.filter(i => i.availability_mode === 'sofort');
  const kuecheItems = data.items.filter(i => i.availability_mode === 'lieferzeit');

  const r = buildReceipt(settings.printer_width);

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
      .separator('=');
    if (data.isReprint) {
      r.huge(true).line('*** NACHDRUCK ***').huge(false);
      r.line(new Date().toLocaleString('de-DE', { timeZone: 'Europe/Vienna' }));
      r.separator('=');
    }
    r.line(`BESTELLUNG #${String(data.orderId).padStart(4, '0')}${splitSuffix}`)
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

  await queuePrintJob('bon', r.toString());
  console.log(`[Drucker] Unified-Bon #${data.orderId} in Druck-Queue eingereiht (${sofortItems.length} sofort, ${kuecheItems.length} kueche)`);
  return true;
}

/**
 * Bill Bon - printed when waiter clicks "Rechnung drucken"
 */
export async function printBillBon(data: BillBonData): Promise<boolean> {
  if (!config.printer.enabled) return false;
  const settings = await getSettings();
  const now = new Date();
  const isBar = !data.tableNumber;
  const tischLabel = data.tableNumber ? `TISCH ${data.tableNumber}` : (data.barSlot ? `BAR ${data.barSlot}` : 'KEIN TISCH');
  const splitSuffix = data.splitPart ? `  (Teil ${data.splitPart.index}/${data.splitPart.total})` : '';
  const r = buildReceipt(settings.printer_width);

  // Company header
  r.center().bold(true).big(true)
    .line(settings.company_name)
    .big(false);
  if (settings.company_address1) r.line(settings.company_address1);
  if (settings.company_address2) r.line(settings.company_address2);
  if (settings.company_betriebsnummer) r.line(`Betriebs-Nr.: ${settings.company_betriebsnummer}`);
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

  if (data.paymentMode === 'jeton' && data.jetonBreakdown) {
    // Positionen ohne EUR-Betraege - der Kellner interessiert sich fuer die Jeton-Stueckzahl
    for (const item of data.items) {
      r.big(true).line(`${item.quantity}x ${item.item_name}`).big(false);
    }

    r.separator('=')
      .center().bold(true).big(true).line('FAELLIGE JETONS').big(false).bold(false).left()
      .separator();

    for (const b of data.jetonBreakdown) {
      r.bold(true).huge(true).row(`${b.count}x ${b.name}`, '').huge(false).bold(false);
    }

    if (data.jetonUnassigned) {
      r.line(`+ ${data.jetonUnassigned.count} Pos. ohne Zuordnung (${data.jetonUnassigned.eur.toFixed(2)} EUR)`);
    }

    if (data.discountType && data.discountValue && data.discountValue > 0) {
      const label = data.discountType === 'percentage'
        ? `Rabatt (${data.discountValue}%)`
        : 'Rabatt';
      r.line(`${label} bereits beruecksichtigt`);
    }

    r.separator('=')
      .line(`(entspricht ${data.total.toFixed(2)} EUR)`)
      .separator('=')
      .center().line(settings.company_footer);
  } else {
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
      .center().line(settings.company_footer);
  }

  r.feed(1).line(settings.company_name);
  if (settings.company_address1) r.line(settings.company_address1);
  if (settings.company_address2) r.line(settings.company_address2);
  r
    .feed(1)
    .line('Powered by (c) MMUELLER')
    .feed(1);

  // Abrisskante am Ende
  r.center().line(CUT_MARK_LINE).line('>>>>  ABRISS  <<<<').line(CUT_MARK_LINE).left();
  r.feed(2).cut();

  await queuePrintJob('rechnung', r.toString());
  console.log('[Drucker] Abrechnungs-Bon in Druck-Queue eingereiht');
  return true;
}

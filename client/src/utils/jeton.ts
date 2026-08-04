import { JetonBreakdownEntry } from '@/types';

interface JetonLineInput {
  jeton_type_id: number | null;
  jeton_name?: string | null;
  jeton_color?: string | null;
  jeton_value?: number | null;
  unit_price: number;
  quantity: number;
}

export interface JetonBreakdownResult {
  breakdown: JetonBreakdownEntry[];
  unassigned: { count: number; eur: number } | null;
}

export function computeJetonBreakdown(items: JetonLineInput[]): JetonBreakdownResult {
  const byColor = new Map<number, JetonBreakdownEntry>();
  let unassignedEur = 0;
  let unassignedCount = 0;

  for (const it of items) {
    if (it.quantity <= 0) continue;
    if (it.jeton_type_id != null && it.jeton_value != null) {
      const lineEur = it.jeton_value * it.quantity;
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
      unassignedEur += it.unit_price * it.quantity;
      unassignedCount += it.quantity;
    }
  }

  return {
    breakdown: Array.from(byColor.values()),
    unassigned: unassignedCount > 0 ? { count: unassignedCount, eur: Math.round(unassignedEur * 100) / 100 } : null,
  };
}

interface JetonSummaryLike {
  jeton_breakdown?: JetonBreakdownEntry[] | null;
  jeton_unassigned?: { count: number; eur: number } | null;
}

/** EUR-Äquivalent einer bereits berechneten Jeton-Aufschlüsselung (z.B. aus getOrderSummary/getTableSummary). */
export function jetonEurSubtotal(summary: JetonSummaryLike): number {
  const breakdownSum = (summary.jeton_breakdown ?? []).reduce((sum, b) => sum + b.subtotal_eur, 0);
  return Math.round((breakdownSum + (summary.jeton_unassigned?.eur ?? 0)) * 100) / 100;
}

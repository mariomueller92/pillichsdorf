import api from './client';

export interface StatsSummary {
  revenue: number;
  bill_count: number;
  avg_bill: number;
  order_count: number;
  item_count: number;
}

export interface StatsTopItem {
  menu_item_id: number;
  item_name: string;
  category_name: string;
  total_quantity: number;
  order_count: number;
}

export interface StatsByWaiter {
  waiter_id: number;
  waiter_name: string;
  order_count: number;
  item_count: number;
}

export interface StatsByCategory {
  category_id: number;
  category_name: string;
  category_target: string;
  item_count: number;
}

export interface StatsBundle {
  summary: StatsSummary;
  top_items: StatsTopItem[];
  by_waiter: StatsByWaiter[];
  by_category: StatsByCategory[];
}

export async function getStats(from?: Date | null, to?: Date | null, limit: number = 10): Promise<StatsBundle> {
  const params: Record<string, string | number> = { limit };
  if (from) params.from = from.toISOString();
  if (to) params.to = to.toISOString();
  const { data } = await api.get<StatsBundle>('/stats', { params });
  return data;
}

export async function resetStats(): Promise<{ ok: boolean; bills: number; orders: number }> {
  const { data } = await api.post('/stats/reset', { confirm: 'RESET' });
  return data;
}

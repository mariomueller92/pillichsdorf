import { useEffect, useState, useCallback } from 'react';
import { useAuthStore } from '@/stores/authStore';
import * as ordersApi from '@/api/orders.api';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { JetonBreakdownList } from '@/components/JetonBreakdownList';
import { computeJetonBreakdown } from '@/utils/jeton';
import { History } from 'lucide-react';
import { formatDbTimeHM, parseDbTime } from '@/utils/time';

interface OrderWithItems {
  id: number;
  status: string;
  created_at: string;
  items: Array<{
    item_name: string;
    quantity: number;
    unit_price: number;
    status: string;
    jeton_type_id?: number | null;
    jeton_name?: string | null;
    jeton_color?: string | null;
    jeton_value?: number | null;
  }>;
}

const statusConfig: Record<string, { label: string; variant: 'success' | 'danger' | 'warning' }> = {
  serviert: { label: 'Bezahlt', variant: 'success' },
  storniert: { label: 'Storniert', variant: 'danger' },
  offen: { label: 'Offen', variant: 'warning' },
  in_bearbeitung: { label: 'Offen', variant: 'warning' },
  fertig: { label: 'Offen', variant: 'warning' },
};

export function KassaHistoryScreen() {
  const user = useAuthStore(s => s.user);
  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchHistory = useCallback(async () => {
    if (!user) return;
    try {
      const list = await ordersApi.getOrders({ waiter_id: user.id });
      const detailed = await Promise.all(list.map((o: any) => ordersApi.getOrder(o.id)));
      const sorted = (detailed as OrderWithItems[]).sort(
        (a, b) => parseDbTime(b.created_at).getTime() - parseDbTime(a.created_at).getTime()
      );
      setOrders(sorted);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  const orderJeton = (order: OrderWithItems) =>
    computeJetonBreakdown(order.items.filter(i => i.status !== 'storniert').map(i => ({
      jeton_type_id: i.jeton_type_id ?? null,
      jeton_name: i.jeton_name,
      jeton_color: i.jeton_color,
      jeton_value: i.jeton_value,
      unit_price: i.unit_price,
      quantity: i.quantity,
    })));

  if (loading) return <div className="flex items-center justify-center h-64"><Spinner /></div>;

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">Bestellhistorie</h1>

      {orders.length === 0 && (
        <div className="flex flex-col items-center justify-center text-slate-400 py-12">
          <History size={48} className="mb-3 opacity-50" />
          <p className="text-lg font-medium">Noch keine Bestellungen</p>
        </div>
      )}

      <div className="space-y-3">
        {orders.map(order => {
          const sc = statusConfig[order.status] || statusConfig.offen;
          const activeItems = order.items.filter(i => i.status !== 'storniert');
          const jeton = orderJeton(order);
          return (
            <div key={order.id} className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-500">{formatDbTimeHM(order.created_at)}</span>
                <Badge variant={sc.variant}>{sc.label}</Badge>
              </div>
              <div className="space-y-0.5 mb-2">
                {(order.status === 'storniert' ? order.items : activeItems).map((item, idx) => (
                  <div key={idx} className={`text-sm ${order.status === 'storniert' ? 'line-through text-slate-400' : ''}`}>
                    {item.quantity}x {item.item_name}
                  </div>
                ))}
              </div>
              {order.status !== 'storniert' && (jeton.breakdown.length > 0 || jeton.unassigned) && (
                <div className="pt-2 border-t border-slate-100">
                  <JetonBreakdownList breakdown={jeton.breakdown} unassigned={jeton.unassigned} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

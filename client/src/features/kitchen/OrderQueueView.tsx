import { useEffect, useState } from 'react';
import { useOrdersStore } from '@/stores/ordersStore';
import * as ordersApi from '@/api/orders.api';
import { Order, OrderItemWithDetails, CategoryTarget } from '@/types';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { toast } from 'sonner';
import { Check, ChefHat, Clock } from 'lucide-react';
import { formatDbTimeHM } from '@/utils/time';

interface OrderQueueViewProps {
  target: CategoryTarget;
  title: string;
}

export function OrderQueueView({ target, title }: OrderQueueViewProps) {
  const { activeOrders, fetchActiveOrders } = useOrdersStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchActiveOrders(target).finally(() => setLoading(false));
    const interval = setInterval(() => fetchActiveOrders(target), 15000);
    return () => clearInterval(interval);
  }, [target]);

  const handleAcknowledge = async (orderId: number, itemIds: number[], status: 'in_zubereitung' | 'fertig') => {
    try {
      await ordersApi.acknowledgeOrder(orderId, itemIds, status);
      await fetchActiveOrders(target);
      toast.success(status === 'fertig' ? 'Als fertig markiert!' : 'Bestätigt!');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Fehler');
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Spinner /></div>;

  const orders = activeOrders.filter(o =>
    o.items?.some(i => i.category_target === target && !['serviert', 'storniert'].includes(i.status))
  );

  return (
    <div className="p-4">
      <div className="flex items-center gap-2 mb-4">
        <ChefHat size={24} />
        <h1 className="text-xl font-bold">{title}</h1>
        <Badge variant="info">{orders.length}</Badge>
      </div>

      {orders.length === 0 && (
        <div className="text-center text-slate-400 py-12">
          <Clock size={48} className="mx-auto mb-2 opacity-50" />
          <p>Keine offenen Bestellungen</p>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {orders.map(order => {
          const relevantItems = order.items.filter(
            i => i.category_target === target && !['serviert', 'storniert'].includes(i.status)
          );
          const newItems = relevantItems.filter(i => i.status === 'neu');
          const inProgressItems = relevantItems.filter(i => i.status === 'in_zubereitung');
          const readyItems = relevantItems.filter(i => i.status === 'fertig');
          const allItemIds = relevantItems.map(i => i.id);
          const newItemIds = newItems.map(i => i.id);
          const inProgressIds = inProgressItems.map(i => i.id);

          return (
            <div
              key={order.id}
              className={`bg-white rounded-xl border-2 p-4 transition-colors ${
                newItems.length > 0 ? 'border-red-300 bg-red-50/50' :
                inProgressItems.length > 0 ? 'border-amber-300 bg-amber-50/50' :
                'border-green-300 bg-green-50/50'
              }`}
            >
              <div className="flex justify-between items-start mb-3">
                <div>
                  <span className="text-lg font-bold">
                    {order.table_number ? `Tisch ${order.table_number}` : 'Bar'}
                  </span>
                  <div className="text-sm text-slate-500">
                    {order.waiter_name} - {formatDbTimeHM(order.created_at)}
                  </div>
                </div>
                <span className="text-xs text-slate-400">#{order.id}</span>
              </div>

              {order.notes && (
                <div className="text-sm bg-amber-100 text-amber-800 rounded px-2 py-1 mb-2">
                  {order.notes}
                </div>
              )}

              <div className="space-y-1.5 mb-3">
                {relevantItems.map(item => (
                  <div key={item.id} className="flex items-center gap-2">
                    <span className={`text-sm ${
                      item.status === 'fertig' ? 'line-through text-slate-400' :
                      item.status === 'in_zubereitung' ? 'text-amber-700' : 'font-medium'
                    }`}>
                      {item.quantity}x {item.item_name}
                    </span>
                    {item.notes && (
                      <span className="text-xs text-slate-500 italic">({item.notes})</span>
                    )}
                    {item.status === 'in_zubereitung' && <Badge variant="warning">in Arbeit</Badge>}
                    {item.status === 'fertig' && <Badge variant="success">fertig</Badge>}
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                {newItems.length > 0 && (
                  <Button
                    variant="warning"
                    size="md"
                    className="flex-1"
                    onClick={() => handleAcknowledge(order.id, newItemIds, 'in_zubereitung')}
                  >
                    Bestätigen
                  </Button>
                )}
                {(inProgressItems.length > 0 || newItems.length > 0) && (
                  <Button
                    variant="success"
                    size="md"
                    className="flex-1"
                    onClick={() => handleAcknowledge(order.id, [...newItemIds, ...inProgressIds], 'fertig')}
                  >
                    <span className="flex items-center gap-1"><Check size={16} /> Fertig</span>
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import * as ordersApi from '@/api/orders.api';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { Clock, ChefHat, CheckCircle, AlertCircle, Truck, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { parseDbTime, minutesSince } from '@/utils/time';

interface OrderWithItems {
  id: number;
  table_id: number | null;
  table_number: string | null;
  waiter_id: number;
  waiter_name: string;
  status: string;
  created_at: string;
  items: Array<{
    id: number;
    order_id: number;
    item_name: string;
    quantity: number;
    status: string;
    category_target: string;
    notes: string | null;
  }>;
}

const statusConfig: Record<string, { label: string; variant: 'warning' | 'info' | 'success' | 'danger' | 'neutral'; icon: typeof Clock }> = {
  offen: { label: 'Offen', variant: 'warning', icon: Clock },
  in_bearbeitung: { label: 'In Arbeit', variant: 'info', icon: ChefHat },
  fertig: { label: 'Abholbereit', variant: 'success', icon: CheckCircle },
  serviert: { label: 'Abgeschlossen', variant: 'neutral', icon: CheckCircle },
  storniert: { label: 'Storniert', variant: 'danger', icon: AlertCircle },
};

const itemStatusBadge: Record<string, { label: string; variant: 'warning' | 'info' | 'success' | 'danger' | 'neutral' }> = {
  neu: { label: 'Warten', variant: 'warning' },
  in_zubereitung: { label: 'In Arbeit', variant: 'info' },
  fertig: { label: 'Bereit', variant: 'success' },
};

export function MyOrders() {
  const user = useAuthStore(s => s.user);
  const navigate = useNavigate();
  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOrders = useCallback(async () => {
    if (!user) return;
    try {
      // Alle Bestellungen ALLER User: offene + abgeschlossene
      const [offen, inProgress, ready, serviert] = await Promise.all([
        ordersApi.getOrders({ status: 'offen' }),
        ordersApi.getOrders({ status: 'in_bearbeitung' }),
        ordersApi.getOrders({ status: 'fertig' }),
        ordersApi.getOrders({ status: 'serviert' }),
      ]);

      const isOpen = (s: string) => s === 'offen' || s === 'in_bearbeitung' || s === 'fertig';
      const combined = [...offen, ...inProgress, ...ready, ...serviert];

      // Offene nach oben (älteste zuerst, damit die länger wartenden oben stehen),
      // abgeschlossene darunter absteigend (neueste zuerst).
      const open = combined.filter(o => isOpen(o.status))
        .sort((a, b) => parseDbTime(a.created_at).getTime() - parseDbTime(b.created_at).getTime());
      const done = combined.filter(o => !isOpen(o.status))
        .sort((a, b) => parseDbTime(b.created_at).getTime() - parseDbTime(a.created_at).getTime());
      const sorted = [...open, ...done];

      const detailed = await Promise.all(
        sorted.map(o => ordersApi.getOrder(o.id))
      );
      setOrders(detailed as OrderWithItems[]);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 10000);
    return () => clearInterval(interval);
  }, [fetchOrders]);

  const handleMarkItemServed = async (orderId: number, itemId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await ordersApi.markItemServed(orderId, itemId);
      toast.success('Als serviert markiert');
      fetchOrders();
    } catch {
      toast.error('Fehler beim Aktualisieren');
    }
  };

  const handleMarkAllServed = async (order: OrderWithItems, e: React.MouseEvent) => {
    e.stopPropagation();
    const readyItems = order.items.filter(i => i.status === 'fertig');
    try {
      for (const item of readyItems) {
        await ordersApi.markItemServed(order.id, item.id);
      }
      toast.success(`${readyItems.length} Artikel als serviert markiert`);
      fetchOrders();
    } catch {
      toast.error('Fehler beim Aktualisieren');
    }
  };

  const handleMarkOrderServed = async (order: OrderWithItems, e: React.MouseEvent) => {
    e.stopPropagation();
    const openItems = order.items.filter(i => i.status !== 'serviert' && i.status !== 'storniert');
    try {
      for (const item of openItems) {
        await ordersApi.markItemServed(order.id, item.id);
      }
      toast.success('Bestellung als serviert markiert');
      fetchOrders();
    } catch {
      toast.error('Fehler beim Aktualisieren');
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Spinner /></div>;

  const timeAgo = (dateStr: string) => {
    const mins = minutesSince(dateStr);
    if (mins < 1) return 'gerade eben';
    if (mins < 60) return `vor ${mins} Min.`;
    return `vor ${Math.floor(mins / 60)} Std.`;
  };

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">Bestellungen</h1>
        <Badge variant="info">
          {orders.filter(o => o.status === 'offen' || o.status === 'in_bearbeitung' || o.status === 'fertig').length} offen
        </Badge>
      </div>

      {orders.length === 0 && (
        <div className="flex flex-col items-center justify-center text-slate-400 py-12">
          <CheckCircle size={48} className="mb-3 opacity-50" />
          <p className="text-lg font-medium">Keine offenen Bestellungen</p>
          <p className="text-sm">Alle Bestellungen wurden ausgeliefert.</p>
        </div>
      )}

      <div className="space-y-3">
        {orders.map(order => {
          const sc = statusConfig[order.status] || statusConfig.offen;
          const Icon = sc.icon;
          const openItems = order.items.filter(i => i.status !== 'serviert' && i.status !== 'storniert');
          const readyItems = openItems.filter(i => i.status === 'fertig');
          const allReady = openItems.length > 0 && openItems.every(i => i.status === 'fertig');

          return (
            <div
              key={order.id}
              className={`bg-white rounded-xl border-2 p-4 transition-all ${
                readyItems.length > 0
                  ? 'border-green-400 bg-green-50/30 shadow-md'
                  : order.status === 'offen'
                    ? 'border-amber-300 bg-amber-50/30'
                    : 'border-slate-200'
              }`}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold">
                    {order.table_number ? `Tisch ${order.table_number}` : 'Bar'}
                  </span>
                  <span className="text-xs text-slate-400">#{order.id}</span>
                  <span className="text-xs text-slate-500">· {order.waiter_name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">{timeAgo(order.created_at)}</span>
                  <Badge variant={sc.variant}>
                    <span className="flex items-center gap-1"><Icon size={12} />{sc.label}</span>
                  </Badge>
                </div>
              </div>

              {/* Items */}
              <div className="space-y-1.5 mb-3">
                {openItems.map(item => {
                  const ib = itemStatusBadge[item.status];
                  const isReady = item.status === 'fertig';
                  return (
                    <div key={item.id} className="flex items-center justify-between text-sm gap-2">
                      <div className="flex-1 min-w-0">
                        <span className={isReady ? 'font-semibold text-green-700' : ''}>
                          {item.quantity}x {item.item_name}
                        </span>
                        {item.notes && <span className="text-xs text-slate-400 ml-1">({item.notes})</span>}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {ib && <Badge variant={ib.variant}>{ib.label}</Badge>}
                        {isReady && (
                          <button
                            onClick={(e) => handleMarkItemServed(order.id, item.id, e)}
                            className="px-2 py-1 text-xs bg-green-600 text-white rounded-lg font-medium active:scale-90 hover:bg-green-700"
                          >
                            Serviert
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Action buttons */}
              <div className="flex gap-2">
                {readyItems.length > 1 && (
                  <Button
                    variant="success"
                    size="sm"
                    className="flex-1"
                    onClick={(e) => handleMarkAllServed(order, e)}
                  >
                    <span className="flex items-center gap-1"><Truck size={14} /> {readyItems.length} fertige serviert</span>
                  </Button>
                )}
                {allReady && (
                  <Button
                    variant="success"
                    size="sm"
                    className="flex-1"
                    onClick={(e) => handleMarkOrderServed(order, e)}
                  >
                    <span className="flex items-center gap-1"><CheckCircle size={14} /> Alles serviert</span>
                  </Button>
                )}
                {order.table_id && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate(`/tisch/${order.table_id}`)}
                  >
                    Zum Tisch
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    try {
                      await ordersApi.reprintOrderBon(order.id);
                      toast.success('Bestellbon nachgedruckt');
                    } catch (err: any) {
                      toast.error(err?.response?.data?.error || 'Nachdruck fehlgeschlagen');
                    }
                  }}
                >
                  <span className="flex items-center gap-1"><Printer size={14} /> Nachdruck</span>
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

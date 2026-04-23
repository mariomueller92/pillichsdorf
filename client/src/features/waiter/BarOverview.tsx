import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import * as ordersApi from '@/api/orders.api';
import * as billingApi from '@/api/billing.api';
import * as dashboardApi from '@/api/dashboard.api';
import { useTablesStore } from '@/stores/tablesStore';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { Modal } from '@/components/ui/Modal';
import { toast } from 'sonner';
import { Plus, Clock, ChefHat, CheckCircle, Receipt, Beer, Percent, Euro, ArrowRight } from 'lucide-react';
import { parseDbTime, formatDbTimeHM } from '@/utils/time';

interface BarOrder {
  id: number;
  table_id: null;
  bar_slot: string | null;
  waiter_id: number;
  waiter_name: string;
  status: string;
  notes: string | null;
  created_at: string;
  items: Array<{
    id: number;
    item_name: string;
    quantity: number;
    unit_price: number;
    status: string;
    notes: string | null;
  }>;
}

const statusConfig: Record<string, { label: string; variant: 'warning' | 'info' | 'success' | 'danger' | 'neutral' }> = {
  offen: { label: 'Offen', variant: 'warning' },
  in_bearbeitung: { label: 'In Arbeit', variant: 'info' },
  fertig: { label: 'Fertig', variant: 'success' },
};

export function BarOverview() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<BarOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const { tables, fetchTables } = useTablesStore();

  // Billing modal state
  const [settlingOrder, setSettlingOrder] = useState<BarOrder | null>(null);
  const [summary, setSummary] = useState<any>(null);
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed' | null>(null);
  const [discountValue, setDiscountValue] = useState(0);
  const [settling, setSettling] = useState(false);

  // Move to table modal state
  const [movingOrder, setMovingOrder] = useState<BarOrder | null>(null);

  const fetchOrders = useCallback(async () => {
    try {
      const [offen, inProgress, fertig] = await Promise.all([
        ordersApi.getOrders({ status: 'offen' }),
        ordersApi.getOrders({ status: 'in_bearbeitung' }),
        ordersApi.getOrders({ status: 'fertig' }),
      ]);
      const barOrders = [...offen, ...inProgress, ...fertig]
        .filter(o => o.table_id === null)
        .sort((a, b) => parseDbTime(b.created_at).getTime() - parseDbTime(a.created_at).getTime());

      const detailed = await Promise.all(barOrders.map(o => ordersApi.getOrder(o.id)));
      setOrders(detailed as BarOrder[]);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchOrders();
    fetchTables();
    const interval = setInterval(fetchOrders, 10000);
    return () => clearInterval(interval);
  }, [fetchOrders]);

  const openSettle = async (order: BarOrder) => {
    setSettlingOrder(order);
    setDiscountType(null);
    setDiscountValue(0);
    try {
      const s = await billingApi.getOrderSummary(order.id);
      setSummary(s);
    } catch {
      toast.error('Fehler beim Laden der Zusammenfassung');
    }
  };

  const getTotal = () => {
    if (!summary) return 0;
    let total = summary.subtotal;
    if (discountType === 'percentage') total -= total * discountValue / 100;
    else if (discountType === 'fixed') total -= discountValue;
    return Math.max(0, Math.round(total * 100) / 100);
  };

  const handleSettle = async () => {
    if (!settlingOrder) return;
    setSettling(true);
    try {
      await billingApi.settleOrder(settlingOrder.id, {
        discount_type: discountType,
        discount_value: discountValue,
      });
      toast.success('Barverkauf abgerechnet!');
      setSettlingOrder(null);
      setSummary(null);
      fetchOrders();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Fehler bei Abrechnung');
    } finally {
      setSettling(false);
    }
  };

  const handleMarkServed = async (order: BarOrder) => {
    try {
      const open = order.items.filter(i => i.status !== 'serviert' && i.status !== 'storniert');
      for (const item of open) {
        await ordersApi.markItemServed(order.id, item.id);
      }
      toast.success('Als serviert markiert');
      fetchOrders();
    } catch {
      toast.error('Fehler');
    }
  };

  const timeStr = (dateStr: string) => formatDbTimeHM(dateStr);

  const orderTotal = (order: BarOrder) =>
    order.items
      .filter(i => i.status !== 'storniert')
      .reduce((sum, i) => sum + i.unit_price * i.quantity, 0);

  if (loading) return <div className="flex items-center justify-center h-64"><Spinner /></div>;

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Beer size={24} />
          <h1 className="text-xl font-bold">Barverkauf</h1>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="info">{orders.length} offen</Badge>
          <Button size="sm" onClick={() => navigate('/bestellen/bar')}>
            <span className="flex items-center gap-1"><Plus size={16} /> Neu</span>
          </Button>
        </div>
      </div>

      {orders.length === 0 && (
        <div className="flex flex-col items-center justify-center text-slate-400 py-12">
          <Beer size={48} className="mb-3 opacity-50" />
          <p className="text-lg font-medium">Keine offenen Barverkäufe</p>
          <Button variant="primary" className="mt-4" onClick={() => navigate('/bestellen/bar')}>
            Neuen Barverkauf starten
          </Button>
        </div>
      )}

      <div className="space-y-3">
        {orders.map(order => {
          const sc = statusConfig[order.status] || statusConfig.offen;
          const total = orderTotal(order);
          const openItems = order.items.filter(i => i.status !== 'serviert' && i.status !== 'storniert');
          const hasReady = openItems.some(i => i.status === 'fertig');

          return (
            <div
              key={order.id}
              className={`bg-white rounded-xl border-2 p-4 ${
                hasReady ? 'border-green-400 bg-green-50/30' : 'border-slate-200'
              }`}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="font-bold">{order.bar_slot || `Bar #${order.id}`}</span>
                  <Badge variant={sc.variant}>{sc.label}</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">{timeStr(order.created_at)}</span>
                  <span className="font-bold text-primary">{total.toFixed(2).replace('.', ',')} &euro;</span>
                </div>
              </div>

              {/* Waiter */}
              <div className="text-xs text-slate-500 mb-2">{order.waiter_name}</div>

              {/* Items */}
              <div className="space-y-1 mb-3">
                {openItems.map(item => (
                  <div key={item.id} className="flex items-center justify-between text-sm">
                    <span className={item.status === 'fertig' ? 'font-medium text-green-700' : ''}>
                      {item.quantity}x {item.item_name}
                      {item.notes && <span className="text-xs text-slate-400 ml-1">({item.notes})</span>}
                    </span>
                    <span className="text-slate-500">{(item.unit_price * item.quantity).toFixed(2).replace('.', ',')} &euro;</span>
                  </div>
                ))}
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                {hasReady && (
                  <Button variant="ghost" size="sm" onClick={() => handleMarkServed(order)}>
                    <span className="flex items-center gap-1"><CheckCircle size={14} /> Serviert</span>
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => { fetchTables(); setMovingOrder(order); }}>
                  <span className="flex items-center gap-1"><ArrowRight size={14} /> Tisch</span>
                </Button>
                <Button variant="success" size="sm" className="flex-1" onClick={() => openSettle(order)}>
                  <span className="flex items-center gap-1"><Receipt size={14} /> Kassieren</span>
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Settle Modal */}
      <Modal
        open={!!settlingOrder}
        onClose={() => { setSettlingOrder(null); setSummary(null); }}
        title={`Barverkauf #${settlingOrder?.id} kassieren`}
      >
        {summary && (
          <div className="flex flex-col gap-4">
            {/* Items */}
            <div className="bg-slate-50 rounded-lg p-3 space-y-1.5">
              {summary.items.map((item: any) => (
                <div key={item.id} className="flex justify-between text-sm">
                  <span>{item.quantity}x {item.item_name}</span>
                  <span className="font-medium">{(item.unit_price * item.quantity).toFixed(2).replace('.', ',')} &euro;</span>
                </div>
              ))}
            </div>

            {/* Subtotal */}
            <div className="flex justify-between px-1">
              <span className="text-slate-600">Zwischensumme</span>
              <span className="font-semibold">{summary.subtotal.toFixed(2).replace('.', ',')} &euro;</span>
            </div>

            {/* Discount */}
            <div className="bg-white rounded-lg border border-slate-200 p-3">
              <div className="text-sm font-medium mb-2">Rabatt</div>
              <div className="flex gap-2 mb-2">
                <button
                  onClick={() => setDiscountType(discountType === 'percentage' ? null : 'percentage')}
                  className={`flex-1 py-2 rounded-lg border text-sm font-medium flex items-center justify-center gap-1 ${
                    discountType === 'percentage' ? 'border-primary bg-primary/10 text-primary' : 'border-slate-200'
                  }`}
                >
                  <Percent size={14} /> %
                </button>
                <button
                  onClick={() => setDiscountType(discountType === 'fixed' ? null : 'fixed')}
                  className={`flex-1 py-2 rounded-lg border text-sm font-medium flex items-center justify-center gap-1 ${
                    discountType === 'fixed' ? 'border-primary bg-primary/10 text-primary' : 'border-slate-200'
                  }`}
                >
                  <Euro size={14} /> EUR
                </button>
              </div>
              {discountType && (
                <input
                  type="number"
                  min="0"
                  step={discountType === 'percentage' ? '1' : '0.5'}
                  value={discountValue || ''}
                  onChange={e => setDiscountValue(parseFloat(e.target.value) || 0)}
                  placeholder={discountType === 'percentage' ? 'z.B. 10' : 'z.B. 2.00'}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2"
                />
              )}
            </div>

            {/* Total */}
            <div className="flex justify-between items-center px-1">
              <span className="text-lg font-bold">Gesamt</span>
              <span className="text-2xl font-bold text-primary">{getTotal().toFixed(2).replace('.', ',')} &euro;</span>
            </div>

            <Button variant="success" size="lg" onClick={handleSettle} disabled={settling}>
              {settling ? 'Kassiere...' : 'Bezahlt'}
            </Button>
          </div>
        )}
      </Modal>

      {/* Move to Table Modal */}
      <Modal
        open={!!movingOrder}
        onClose={() => setMovingOrder(null)}
        title={`${movingOrder?.bar_slot || 'Bar'} auf Tisch verschieben`}
      >
        <p className="text-sm text-slate-500 mb-3">Ziel-Tisch wählen:</p>
        <div className="grid grid-cols-3 gap-2">
          {tables.filter(t => t.status === 'frei' && !t.merged_into_id).map(t => (
            <button
              key={t.id}
              onClick={async () => {
                if (!movingOrder) return;
                try {
                  await dashboardApi.moveBarToTable(movingOrder.id, t.id);
                  toast.success(`${movingOrder.bar_slot} -> Tisch ${t.table_number}`);
                  setMovingOrder(null);
                  fetchOrders();
                } catch { toast.error('Fehler beim Verschieben'); }
              }}
              className="p-3 rounded-lg border-2 border-green-300 bg-green-50 text-center font-bold active:scale-95 hover:bg-green-100"
            >
              {t.table_number}
            </button>
          ))}
        </div>
        {tables.filter(t => t.status === 'frei' && !t.merged_into_id).length === 0 && (
          <p className="text-center text-slate-400 py-4">Keine freien Tische verfügbar</p>
        )}
      </Modal>
    </div>
  );
}

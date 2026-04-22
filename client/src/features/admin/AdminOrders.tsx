import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import * as ordersApi from '@/api/orders.api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';

type AdminOrder = {
  id: number;
  created_at: string;
  status: string;
  waiter_name: string;
  table_number: string | null;
  bar_slot: string | null;
  notes: string | null;
  total: number;
  items: Array<{
    id: number;
    item_name: string;
    quantity: number;
    unit_price: number;
    status: string;
    notes: string | null;
    category_name: string;
  }>;
};

const statusVariant = (s: string): 'success' | 'danger' | 'warning' | 'info' | 'neutral' => {
  if (s === 'serviert') return 'success';
  if (s === 'storniert') return 'danger';
  if (s === 'fertig') return 'info';
  if (s === 'in_bearbeitung') return 'warning';
  return 'neutral';
};

const formatDateKey = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString('de-DE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
};

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

const toInputDate = (d: Date) => d.toISOString().slice(0, 10);

export function AdminOrders() {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [collapsedDays, setCollapsedDays] = useState<Set<string>>(new Set());

  const load = async () => {
    setLoading(true);
    try {
      const params: { from?: string; to?: string } = {};
      if (from) params.from = `${from} 00:00:00`;
      if (to) {
        const next = new Date(to);
        next.setDate(next.getDate() + 1);
        params.to = `${toInputDate(next)} 00:00:00`;
      }
      const data = await ordersApi.getAllOrdersAdmin(params);
      setOrders(data);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Laden fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const groups = useMemo(() => {
    const map = new Map<string, AdminOrder[]>();
    for (const o of orders) {
      const key = formatDateKey(o.created_at);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(o);
    }
    return Array.from(map.entries());
  }, [orders]);

  const toggleOrder = (id: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleDay = (key: string) => {
    setCollapsedDays(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const setPreset = (days: number) => {
    const now = new Date();
    const start = new Date();
    start.setDate(now.getDate() - days);
    setFrom(toInputDate(start));
    setTo(toInputDate(now));
  };

  const clearFilter = () => {
    setFrom('');
    setTo('');
  };

  return (
    <div className="p-4 max-w-5xl mx-auto space-y-4">
      <div className="flex flex-wrap items-end gap-3 bg-white rounded-lg p-4 shadow-sm">
        <Input label="Von" type="date" value={from} onChange={e => setFrom(e.target.value)} />
        <Input label="Bis" type="date" value={to} onChange={e => setTo(e.target.value)} />
        <Button onClick={load} variant="primary">Filtern</Button>
        <Button onClick={() => setPreset(0)} variant="ghost" size="sm">Heute</Button>
        <Button onClick={() => setPreset(7)} variant="ghost" size="sm">7 Tage</Button>
        <Button onClick={() => setPreset(30)} variant="ghost" size="sm">30 Tage</Button>
        <Button onClick={() => { clearFilter(); load(); }} variant="ghost" size="sm">Alle</Button>
      </div>

      {loading && (
        <div className="flex justify-center py-12"><Spinner /></div>
      )}

      {!loading && groups.length === 0 && (
        <div className="text-center text-slate-500 py-12">Keine Bestellungen im gewählten Zeitraum</div>
      )}

      {!loading && groups.map(([day, dayOrders]) => {
        const dayTotal = dayOrders
          .filter(o => o.status !== 'storniert')
          .reduce((s, o) => s + o.total, 0);
        const collapsed = collapsedDays.has(day);
        return (
          <div key={day} className="bg-white rounded-lg shadow-sm overflow-hidden">
            <button
              onClick={() => toggleDay(day)}
              className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 border-b border-slate-200"
            >
              <div className="flex items-center gap-2">
                {collapsed ? <ChevronRight size={18} /> : <ChevronDown size={18} />}
                <span className="font-semibold text-slate-800">{day}</span>
                <Badge variant="neutral">{dayOrders.length} Bestellungen</Badge>
              </div>
              <span className="font-bold text-slate-800">{dayTotal.toFixed(2)} €</span>
            </button>

            {!collapsed && (
              <div className="divide-y divide-slate-100">
                {dayOrders.map(order => {
                  const isOpen = expanded.has(order.id);
                  const label = order.table_number ? `Tisch ${order.table_number}` : (order.bar_slot || 'BAR');
                  return (
                    <div key={order.id}>
                      <button
                        onClick={() => toggleOrder(order.id)}
                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 text-left"
                      >
                        <div className="flex items-center gap-3 flex-wrap">
                          {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          <span className="font-mono text-sm text-slate-500">#{String(order.id).padStart(4, '0')}</span>
                          <span className="font-medium">{label}</span>
                          <span className="text-sm text-slate-500">{formatTime(order.created_at)}</span>
                          <span className="text-sm text-slate-500">{order.waiter_name}</span>
                          <Badge variant={statusVariant(order.status)}>{order.status}</Badge>
                        </div>
                        <span className="font-semibold">{order.total.toFixed(2)} €</span>
                      </button>

                      {isOpen && (
                        <div className="px-4 pb-4 bg-slate-50/50">
                          {order.notes && (
                            <div className="text-sm text-slate-600 mb-2 italic">Notiz: {order.notes}</div>
                          )}
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-slate-500 text-xs">
                                <th className="text-left py-1">Artikel</th>
                                <th className="text-left py-1">Kategorie</th>
                                <th className="text-right py-1">Menge</th>
                                <th className="text-right py-1">Einzelpr.</th>
                                <th className="text-right py-1">Summe</th>
                                <th className="text-left py-1 pl-2">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {order.items.map(it => (
                                <tr key={it.id} className={it.status === 'storniert' ? 'text-slate-400 line-through' : ''}>
                                  <td className="py-1">
                                    {it.item_name}
                                    {it.notes && <span className="text-xs text-slate-500"> ({it.notes})</span>}
                                  </td>
                                  <td className="py-1 text-slate-500">{it.category_name}</td>
                                  <td className="py-1 text-right">{it.quantity}</td>
                                  <td className="py-1 text-right">{it.unit_price.toFixed(2)} €</td>
                                  <td className="py-1 text-right">{(it.unit_price * it.quantity).toFixed(2)} €</td>
                                  <td className="py-1 pl-2"><Badge variant={statusVariant(it.status)}>{it.status}</Badge></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

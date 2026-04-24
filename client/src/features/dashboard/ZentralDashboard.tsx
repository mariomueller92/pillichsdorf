import { useEffect, useState, useCallback } from 'react';
import { useTablesStore } from '@/stores/tablesStore';
import { useMenuStore } from '@/stores/menuStore';
import * as dashboardApi from '@/api/dashboard.api';
import * as tablesApi from '@/api/tables.api';
import { MenuItem } from '@/types';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { Clock, AlertTriangle, ToggleLeft, ToggleRight, RefreshCw, X, Trophy } from 'lucide-react';
import { toast } from 'sonner';
import { parseDbTime, formatDbTimeHM, minutesSince } from '@/utils/time';

const itemStatusBadge: Record<string, { label: string; variant: 'warning' | 'info' | 'success' | 'danger' | 'neutral' }> = {
  neu: { label: 'Warten', variant: 'warning' },
  in_zubereitung: { label: 'In Arbeit', variant: 'info' },
  fertig: { label: 'Bereit', variant: 'success' },
  serviert: { label: 'Geliefert', variant: 'neutral' },
};

const orderStatusBadge: Record<string, { label: string; variant: 'warning' | 'info' | 'success' | 'danger' | 'neutral' }> = {
  offen: { label: 'Offen', variant: 'warning' },
  in_bearbeitung: { label: 'In Arbeit', variant: 'info' },
  fertig: { label: 'Bereit', variant: 'success' },
  serviert: { label: 'Geliefert', variant: 'neutral' },
};

interface PendingItem {
  id: number;
  order_id: number;
  quantity: number;
  notes: string | null;
  status: string;
  item_name: string;
  availability_mode: string;
  table_id: number | null;
  bar_slot: string | null;
  table_number: string | null;
  order_created_at: string;
}

export function ZentralDashboard() {
  const { tables, fetchTables } = useTablesStore();
  const { items, categories, fetchMenu } = useMenuStore();
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([]);
  const [topItems, setTopItems] = useState<Array<{ menu_item_id: number; item_name: string; category_name: string; total_quantity: number; order_count: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTableId, setSelectedTableId] = useState<number | null>(null);
  const [selectedTable, setSelectedTable] = useState<any | null>(null);
  const [now, setNow] = useState<number>(Date.now());

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  const fetchAll = useCallback(async () => {
    await Promise.all([fetchTables(), fetchMenu()]);
    const [pending, top] = await Promise.all([
      dashboardApi.getPendingKitchenItems(),
      dashboardApi.getTopItems(10),
    ]);
    setPendingItems(pending);
    setTopItems(top);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 5000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  useEffect(() => {
    if (selectedTableId == null) {
      setSelectedTable(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const data = await tablesApi.getTable(selectedTableId);
        if (!cancelled) setSelectedTable(data);
      } catch {
        if (!cancelled) setSelectedTable(null);
      }
    };
    load();
    const interval = setInterval(load, 5000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [selectedTableId]);

  const handleToggleMode = async (item: MenuItem) => {
    try {
      await dashboardApi.toggleItemMode(item.id);
      await fetchMenu();
      toast.success(`${item.name}: ${item.availability_mode === 'sofort' ? 'Lieferzeit' : 'Sofort'}`);
    } catch {
      toast.error('Fehler beim Umschalten');
    }
  };

  const minutesAgo = (dateStr: string) => minutesSince(dateStr, now);

  if (loading) return <div className="flex items-center justify-center h-64"><Spinner /></div>;

  const pendingMinutes = (table: { oldest_pending_at?: string | null }) => {
    if (!table.oldest_pending_at) return null;
    return minutesSince(table.oldest_pending_at, now);
  };

  const tableStatusColor = (table: { status: string; has_pending_items?: number; oldest_pending_at?: string | null }) => {
    if (table.status === 'rechnung_angefordert') return 'bg-red-500 text-white animate-pulse';
    if (table.status === 'frei') return 'bg-green-500 text-white';
    if (table.status === 'besetzt') {
      const mins = pendingMinutes(table);
      if (mins == null) return 'bg-sky-500 text-white';
      if (mins >= 10) return 'bg-red-500 text-white animate-pulse';
      if (mins >= 5) return 'bg-orange-600 text-white';
      return 'bg-orange-500 text-white';
    }
    return 'bg-slate-300';
  };

  const tableStatusLabel = (table: { status: string; has_pending_items?: number; oldest_pending_at?: string | null }) => {
    if (table.status === 'rechnung_angefordert') return 'RECHNUNG';
    if (table.status === 'frei') return 'Frei';
    if (table.status === 'besetzt') {
      const mins = pendingMinutes(table);
      if (mins == null) return 'Besetzt';
      return `${mins} Min.`;
    }
    return table.status;
  };

  // Group items for Nachschub-Radar
  const groupedPending = pendingItems.reduce((acc, item) => {
    const key = `${item.order_id}-${item.table_number || item.bar_slot || 'bar'}`;
    if (!acc[key]) {
      acc[key] = {
        tableLabel: item.table_number ? `Tisch ${item.table_number}` : (item.bar_slot || 'Bar'),
        orderCreatedAt: item.order_created_at,
        items: [],
      };
    }
    acc[key].items.push(item);
    return acc;
  }, {} as Record<string, { tableLabel: string; orderCreatedAt: string; items: PendingItem[] }>);

  const sortedPending = Object.values(groupedPending)
    .sort((a, b) => parseDbTime(a.orderCreatedAt).getTime() - parseDbTime(b.orderCreatedAt).getTime());

  return (
    <div className="p-4 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h1 className="text-2xl font-bold">Zentral-Dashboard</h1>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-sm text-slate-500 leading-tight">
              {new Date(now).toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Vienna' })}
            </div>
            <div className="text-xl font-mono font-semibold leading-tight tabular-nums">
              {new Date(now).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Europe/Vienna' })}
            </div>
          </div>
          <button onClick={fetchAll} className="p-2 rounded-lg hover:bg-slate-200 active:scale-90">
            <RefreshCw size={20} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* === TISCH-MATRIX === */}
        <div className="lg:col-span-1">
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            Tisch-Matrix
          </h2>
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-3 gap-2">
            {tables.filter(t => !t.merged_into_id).map(table => {
              const isSelected = selectedTableId === table.id;
              const sessionMins = table.status === 'besetzt' && table.session_started_at
                ? minutesSince(table.session_started_at, now)
                : null;
              return (
                <button
                  key={table.id}
                  onClick={() => setSelectedTableId(isSelected ? null : table.id)}
                  className={`p-3 rounded-xl text-center font-bold active:scale-95 transition-all ${tableStatusColor(table)} ${isSelected ? 'ring-4 ring-blue-400' : ''}`}
                >
                  <div className="text-xl">{table.table_number}</div>
                  <div className="text-xs opacity-90">{tableStatusLabel(table)}</div>
                  {sessionMins != null && (
                    <div className="text-[10px] opacity-80">ges. {sessionMins}m</div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3 text-xs text-slate-500">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-500" /> Frei</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-sky-500" /> Besetzt</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-orange-500" /> &lt;5 Min</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-orange-600" /> 5–10 Min</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-500" /> &gt;10 Min / Rechnung</span>
          </div>

          {/* Bestellungen des ausgewählten Tisches */}
          {selectedTableId != null && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-sm">
                  Bestellungen Tisch {selectedTable?.table_number ?? ''}
                </h3>
                <button
                  onClick={() => setSelectedTableId(null)}
                  className="p-1 rounded hover:bg-slate-100 text-slate-500"
                  aria-label="Auswahl aufheben"
                >
                  <X size={16} />
                </button>
              </div>
              {selectedTable == null ? (
                <div className="text-slate-400 text-xs py-2">Lade...</div>
              ) : (selectedTable.orders?.length ?? 0) === 0 ? (
                <div className="text-slate-400 text-xs py-2">Keine Bestellungen</div>
              ) : (
                <div className="space-y-1.5 max-h-[50vh] overflow-y-auto pr-1">
                  {[...selectedTable.orders]
                    .sort((a: any, b: any) => parseDbTime(b.created_at).getTime() - parseDbTime(a.created_at).getTime())
                    .map((order: any) => {
                      const ob = orderStatusBadge[order.status];
                      const waitMins = minutesSince(order.created_at, now);
                      const isOutstanding = order.status !== 'serviert' && order.status !== 'storniert';
                      const urgent = isOutstanding && waitMins >= 10;
                      const warn = isOutstanding && !urgent && waitMins >= 5;
                      const cardClass = urgent
                        ? 'border-red-500 bg-red-50 animate-pulse'
                        : warn
                          ? 'border-orange-400 bg-orange-50'
                          : 'border-slate-200';
                      const waitClass = urgent
                        ? 'text-red-700 font-semibold'
                        : warn
                          ? 'text-orange-700 font-medium'
                          : 'text-slate-500';
                      return (
                        <div key={order.id} className={`border rounded-lg p-2 ${cardClass}`}>
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="text-xs font-medium">
                              #{order.id} · {order.waiter_name}
                            </span>
                            {ob && <Badge variant={ob.variant}>{ob.label}</Badge>}
                          </div>
                          <div className={`text-[10px] mb-1 flex items-center gap-1 ${waitClass}`}>
                            <Clock size={10} />
                            <span>{formatDbTimeHM(order.created_at)}</span>
                            <span>·</span>
                            <span>{waitMins < 1 ? 'gerade eben' : `vor ${waitMins} Min.`}</span>
                          </div>
                          {order.items?.length > 0 ? (
                            <div className="space-y-0.5 border-t border-slate-100 pt-1">
                              {order.items.map((item: any) => {
                                const ib = itemStatusBadge[item.status];
                                const isServed = item.status === 'serviert';
                                return (
                                  <div key={item.id} className={`flex items-center justify-between text-xs gap-2 ${isServed ? 'opacity-60' : ''}`}>
                                    <div className="flex-1 min-w-0 truncate">
                                      <span className="font-medium">{item.quantity}x {item.item_name}</span>
                                      {item.notes && <span className="text-[10px] text-slate-400 ml-1">({item.notes})</span>}
                                    </div>
                                    {ib && <Badge variant={ib.variant}>{ib.label}</Badge>}
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="text-[10px] text-slate-400 border-t border-slate-100 pt-1">Keine Positionen</div>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* === NACHSCHUB-RADAR === */}
        <div className="lg:col-span-1">
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <AlertTriangle size={20} className="text-orange-500" />
            Nachschub-Radar
            <Badge variant="warning">{pendingItems.length}</Badge>
          </h2>

          {sortedPending.length === 0 && (
            <div className="text-slate-400 text-center py-8">
              Keine offenen Küchen-Bestellungen
            </div>
          )}

          <div className="space-y-2 max-h-[40vh] overflow-y-auto">
            {sortedPending.map((group, idx) => {
              const mins = minutesAgo(group.orderCreatedAt);
              const urgent = mins > 10;
              return (
                <div
                  key={idx}
                  className={`bg-white rounded-lg border-2 p-3 ${
                    urgent ? 'border-red-400 bg-red-50' : 'border-orange-300 bg-orange-50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold">{group.tableLabel}</span>
                    <span className={`flex items-center gap-1 text-sm font-medium ${urgent ? 'text-red-600' : 'text-orange-600'}`}>
                      <Clock size={14} />
                      {mins} Min.
                    </span>
                  </div>
                  {group.items.map(item => (
                    <div key={item.id} className="text-sm">
                      <span className="font-medium">{item.quantity}x {item.item_name}</span>
                      {item.notes && <span className="text-xs text-slate-500 ml-1">({item.notes})</span>}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>

          {/* Top-Seller */}
          <h2 className="text-lg font-semibold mb-3 mt-6 flex items-center gap-2">
            <Trophy size={20} className="text-amber-500" />
            Top-Seller
          </h2>
          {topItems.length === 0 ? (
            <div className="text-slate-400 text-sm py-4">Noch keine Verkäufe</div>
          ) : (
            <div className="space-y-1 max-h-[35vh] overflow-y-auto">
              {topItems.map((ti, idx) => {
                const rankColor = idx === 0 ? 'text-amber-500' : idx === 1 ? 'text-slate-400' : idx === 2 ? 'text-orange-700' : 'text-slate-300';
                return (
                  <div key={ti.menu_item_id} className="flex items-center justify-between gap-2 text-sm py-1 px-2 rounded hover:bg-slate-50">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className={`font-bold w-5 text-right ${rankColor}`}>{idx + 1}.</span>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">{ti.item_name}</div>
                        <div className="text-[10px] text-slate-400 truncate">{ti.category_name}</div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-semibold tabular-nums">{ti.total_quantity}×</div>
                      <div className="text-[10px] text-slate-400">{ti.order_count} Best.</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* === BESTANDS-SCHALTER === */}
        <div className="lg:col-span-1">
          <h2 className="text-lg font-semibold mb-3">Bestands-Schalter</h2>
          <div className="space-y-1 max-h-[60vh] overflow-y-auto">
            {categories.map(cat => {
              const catItems = items.filter(i => i.category_id === cat.id && i.is_available);
              if (catItems.length === 0) return null;
              return (
                <div key={cat.id}>
                  <div className="text-xs font-semibold text-slate-400 uppercase mt-3 mb-1 px-1">
                    {cat.name}
                  </div>
                  {catItems.map(item => (
                    <button
                      key={item.id}
                      onClick={() => handleToggleMode(item)}
                      className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 active:scale-[0.98] transition-all"
                    >
                      <span className="text-sm font-medium">{item.name}</span>
                      <div className="flex items-center gap-2">
                        {item.availability_mode === 'sofort' ? (
                          <>
                            <span className="text-xs text-green-700 font-medium">Sofort</span>
                            <ToggleRight size={24} className="text-green-600" />
                          </>
                        ) : (
                          <>
                            <span className="text-xs text-orange-700 font-medium">Lieferzeit</span>
                            <ToggleLeft size={24} className="text-orange-500" />
                          </>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>

    </div>
  );
}

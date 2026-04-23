import { useEffect, useState, useCallback } from 'react';
import { BarChart3, RefreshCw, Trophy, Users, Tags, Euro, Trash2 } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import * as statsApi from '@/api/stats.api';
import { useAuthStore } from '@/stores/authStore';
import { toast } from 'sonner';

type RangeKey = 'today' | 'week' | 'month' | 'all';

const RANGE_LABELS: Record<RangeKey, string> = {
  today: 'Heute',
  week: 'Diese Woche',
  month: 'Dieser Monat',
  all: 'Gesamt',
};

function rangeBounds(key: RangeKey): { from: Date | null; to: Date | null } {
  if (key === 'all') return { from: null, to: null };
  const now = new Date();
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  if (key === 'today') {
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return { from, to };
  }
  if (key === 'week') {
    const day = now.getDay();
    const daysSinceMonday = day === 0 ? 6 : day - 1;
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysSinceMonday);
    return { from, to };
  }
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from, to };
}

const euro = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

export function StatsPage() {
  const [range, setRange] = useState<RangeKey>('today');
  const [bundle, setBundle] = useState<statsApi.StatsBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const user = useAuthStore(s => s.user);
  const isAdmin = user?.role === 'admin';

  const load = useCallback(async () => {
    const { from, to } = rangeBounds(range);
    try {
      const data = await statsApi.getStats(from, to, 10);
      setBundle(data);
    } finally {
      setLoading(false);
    }
  }, [range]);

  const handleReset = async () => {
    const ok = confirm(
      'STATISTIK WIRKLICH ZURÜCKSETZEN?\n\n' +
      'Alle Rechnungen, Bestellungen und Positionen werden gelöscht.\n' +
      'Menü, Benutzer und Tische bleiben erhalten.\n\n' +
      'Diese Aktion kann NICHT rückgängig gemacht werden.'
    );
    if (!ok) return;
    setResetting(true);
    try {
      const r = await statsApi.resetStats();
      toast.success(`Zurückgesetzt: ${r.bills} Rechnungen, ${r.orders} Bestellungen gelöscht`);
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Reset fehlgeschlagen');
    } finally {
      setResetting(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const maxCat = bundle?.by_category.reduce((m, c) => Math.max(m, c.item_count), 0) || 0;

  return (
    <div className="p-4 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BarChart3 size={26} /> Statistik
        </h1>
        <div className="flex items-center gap-1">
          <button onClick={load} className="p-2 rounded-lg hover:bg-slate-200 active:scale-90">
            <RefreshCw size={20} />
          </button>
          {isAdmin && (
            <button
              onClick={handleReset}
              disabled={resetting}
              title="Statistik zurücksetzen (Admin)"
              className="p-2 rounded-lg text-red-600 hover:bg-red-50 active:scale-90 disabled:opacity-50"
            >
              <Trash2 size={20} />
            </button>
          )}
        </div>
      </div>

      {/* Range Switcher */}
      <div className="flex gap-1 mb-4 bg-slate-100 p-1 rounded-lg w-fit">
        {(Object.keys(RANGE_LABELS) as RangeKey[]).map(k => (
          <button
            key={k}
            onClick={() => setRange(k)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
              range === k ? 'bg-white shadow text-slate-900' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {RANGE_LABELS[k]}
          </button>
        ))}
      </div>

      {loading || !bundle ? (
        <div className="flex items-center justify-center h-64"><Spinner /></div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <KpiCard label="Umsatz" value={euro(bundle.summary.revenue)} icon={<Euro size={18} className="text-green-600" />} />
            <KpiCard label="Rechnungen" value={bundle.summary.bill_count.toLocaleString('de-DE')} />
            <KpiCard label="Ø Rechnung" value={euro(bundle.summary.avg_bill)} />
            <KpiCard label="Bestellungen" value={bundle.summary.order_count.toLocaleString('de-DE')} sub={`${bundle.summary.item_count} Positionen`} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Top-Produkte */}
            <Panel icon={<Trophy size={18} className="text-amber-500" />} title="Top-Produkte">
              {bundle.top_items.length === 0 ? (
                <Empty text="Keine Verkäufe" />
              ) : (
                <div className="space-y-1">
                  {bundle.top_items.map((ti, idx) => {
                    const rankColor = idx === 0 ? 'text-amber-500' : idx === 1 ? 'text-slate-400' : idx === 2 ? 'text-orange-700' : 'text-slate-300';
                    return (
                      <div key={ti.menu_item_id} className="flex items-center gap-2 text-sm py-1 px-2 rounded hover:bg-slate-50">
                        <span className={`font-bold w-5 text-right ${rankColor}`}>{idx + 1}.</span>
                        <div className="min-w-0 flex-1">
                          <div className="font-medium truncate">{ti.item_name}</div>
                          <div className="text-[10px] text-slate-400 truncate">{ti.category_name}</div>
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
            </Panel>

            {/* Kellner-Ranking */}
            <Panel icon={<Users size={18} className="text-sky-500" />} title="Pro Kellner">
              {bundle.by_waiter.length === 0 ? (
                <Empty text="Keine Bestellungen" />
              ) : (
                <div className="space-y-1">
                  {bundle.by_waiter.map((w, idx) => (
                    <div key={w.waiter_id} className="flex items-center gap-2 text-sm py-1 px-2 rounded hover:bg-slate-50">
                      <span className="font-bold w-5 text-right text-slate-400">{idx + 1}.</span>
                      <div className="min-w-0 flex-1 font-medium truncate">{w.waiter_name}</div>
                      <div className="text-right shrink-0">
                        <div className="font-semibold tabular-nums">{w.order_count}</div>
                        <div className="text-[10px] text-slate-400">{w.item_count} Pos.</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            {/* Kategorien */}
            <Panel icon={<Tags size={18} className="text-purple-500" />} title="Nach Kategorie">
              {bundle.by_category.length === 0 ? (
                <Empty text="Keine Daten" />
              ) : (
                <div className="space-y-1.5">
                  {bundle.by_category.map(c => {
                    const pct = maxCat > 0 ? (c.item_count / maxCat) * 100 : 0;
                    const barColor = c.category_target === 'kueche' ? 'bg-orange-400' : 'bg-sky-400';
                    return (
                      <div key={c.category_id} className="px-2 py-1">
                        <div className="flex items-center justify-between text-sm mb-0.5">
                          <span className="font-medium truncate">{c.category_name}</span>
                          <span className="tabular-nums text-slate-600 shrink-0 ml-2">{c.item_count}×</span>
                        </div>
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full ${barColor}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}

function KpiCard({ label, value, sub, icon }: { label: string; value: string; sub?: string; icon?: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-3">
      <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1">
        {icon} <span>{label}</span>
      </div>
      <div className="text-xl font-bold tabular-nums">{value}</div>
      {sub && <div className="text-xs text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );
}

function Panel({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-3">
      <h2 className="text-sm font-semibold mb-2 flex items-center gap-2">
        {icon} {title}
      </h2>
      {children}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="text-slate-400 text-sm py-4 text-center">{text}</div>;
}

import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as billingApi from '@/api/billing.api';
import * as tablesApi from '@/api/tables.api';
import * as ordersApi from '@/api/orders.api';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { toast } from 'sonner';
import { ArrowLeft, Percent, Euro, AlertTriangle, Printer, Split, Minus, Plus, X } from 'lucide-react';

const DELIVERED_STATUS = 'serviert';
const statusLabel: Record<string, string> = {
  neu: 'noch nicht bestätigt',
  in_zubereitung: 'in Zubereitung',
  fertig: 'fertig, aber nicht serviert',
};

export function BillingScreen() {
  const { tischId } = useParams<{ tischId: string }>();
  const navigate = useNavigate();
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed' | null>(null);
  const [discountValue, setDiscountValue] = useState(0);
  const [settling, setSettling] = useState(false);
  const [selected, setSelected] = useState<Map<number, number>>(new Map());
  const [splitting, setSplitting] = useState(false);
  const [splitMode, setSplitMode] = useState(false);
  const [showFreePrompt, setShowFreePrompt] = useState(false);

  const reload = async () => {
    if (!tischId) return;
    const data = await billingApi.getTableSummary(parseInt(tischId));
    setSummary(data);
    setSelected(new Map());
    setLoading(false);
    return data;
  };

  useEffect(() => {
    reload();
  }, [tischId]);

  const setQty = (id: number, qty: number, max: number) => {
    setSelected(prev => {
      const next = new Map(prev);
      const clamped = Math.max(0, Math.min(max, qty));
      if (clamped === 0) next.delete(id);
      else next.set(id, clamped);
      return next;
    });
  };

  const selectedCount = Array.from(selected.values()).reduce((s, n) => s + n, 0);
  const selectedSubtotal = summary?.items
    .reduce((s: number, i: any) => s + i.unit_price * (selected.get(i.id) ?? 0), 0) ?? 0;

  const getTotal = () => {
    if (!summary) return 0;
    let total = summary.subtotal;
    if (discountType === 'percentage') {
      total -= total * discountValue / 100;
    } else if (discountType === 'fixed') {
      total -= discountValue;
    }
    return Math.max(0, Math.round(total * 100) / 100);
  };

  const undeliveredItems = summary?.items.filter((i: any) => i.status !== DELIVERED_STATUS) ?? [];
  const hasItems = summary && summary.items.length > 0;

  const handleSettle = async (withPrint: boolean) => {
    if (!tischId || !summary) return;

    if (undeliveredItems.length > 0) {
      const lines = undeliveredItems
        .map((i: any) => `- ${i.quantity}x ${i.item_name} (${statusLabel[i.status] ?? i.status})`)
        .join('\n');
      const confirmed = confirm(
        `Achtung: ${undeliveredItems.length} Position(en) wurden noch nicht serviert:\n\n${lines}\n\nTrotzdem ALLE Positionen abrechnen?`
      );
      if (!confirmed) return;
    }

    setSettling(true);
    try {
      await billingApi.settleTable(parseInt(tischId), {
        discount_type: discountType,
        discount_value: discountValue,
        print_bon: withPrint,
      });
      toast.success(withPrint ? 'Tisch abgerechnet & Bon gedruckt' : 'Tisch abgerechnet (ohne Druck)');
      // Popup: Tisch freigeben oder besetzt lassen?
      setShowFreePrompt(true);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Fehler bei Abrechnung');
    } finally {
      setSettling(false);
    }
  };

  const handleFreeTable = async () => {
    if (!tischId) return;
    try {
      await tablesApi.releaseTable(parseInt(tischId));
      toast.success('Tisch freigegeben');
      navigate('/tische');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Fehler beim Freigeben');
    }
  };

  const handleKeepTable = () => {
    setShowFreePrompt(false);
    // In Tisch-Ansicht bleiben
    if (tischId) navigate(`/tisch/${tischId}`);
  };

  const handleCancelItem = async (item: any) => {
    if (!confirm(`Position "${item.quantity}x ${item.item_name}" stornieren?`)) return;
    try {
      await ordersApi.updateItemStatus(item.order_id, item.id, 'storniert');
      toast.success('Position storniert');
      await reload();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Storno fehlgeschlagen');
    }
  };

  const handleSplit = async (withPrint: boolean) => {
    if (!tischId || selectedCount === 0) return;
    setSplitting(true);
    try {
      await billingApi.settleItems({
        table_id: parseInt(tischId),
        items: Array.from(selected.entries()).map(([order_item_id, quantity]) => ({ order_item_id, quantity })),
        discount_type: discountType,
        discount_value: discountValue,
        print_bon: withPrint,
      });
      toast.success(withPrint ? 'Teilrechnung gedruckt' : 'Teilrechnung gespeichert');
      const next = await reload();
      if (next && next.items.length === 0) {
        toast.success('Alle Positionen abgerechnet');
        setShowFreePrompt(true);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Fehler bei Teilrechnung');
    } finally {
      setSplitting(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Spinner /></div>;
  if (!summary) return <div className="p-4">Keine Daten</div>;

  return (
    <div className="p-4">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => navigate(-1)} className="p-1"><ArrowLeft size={20} /></button>
        <h1 className="text-xl font-bold">Abrechnung - Tisch {tischId}</h1>
      </div>

      {/* Free-Table Popup */}
      {showFreePrompt && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <h2 className="text-lg font-bold mb-2">Rechnung bezahlt</h2>
            <p className="text-slate-600 mb-4">
              Alle Positionen sind abgerechnet. Tisch freigeben oder besetzt lassen?
            </p>
            <div className="flex flex-col gap-2">
              <Button variant="success" size="lg" className="w-full" onClick={handleFreeTable}>
                Tisch freigeben
              </Button>
              <Button variant="ghost" size="lg" className="w-full" onClick={handleKeepTable}>
                Besetzt lassen
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Warning: undelivered items */}
      {undeliveredItems.length > 0 && (
        <div className="bg-amber-50 border border-amber-300 text-amber-900 rounded-xl p-3 mb-4 flex gap-2">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <div className="text-sm">
            <div className="font-semibold">
              {undeliveredItems.length} Position(en) noch nicht serviert
            </div>
            <div>Beim Abrechnen muss der Mitarbeiter das explizit bestätigen.</div>
          </div>
        </div>
      )}

      {/* Items */}
      <div className="bg-white rounded-xl border border-slate-200 mb-4">
        <div className="px-4 py-2 border-b border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span>
            {splitMode ? 'Positionen für Teilrechnung anhaken' : `${summary.items.length} Position(en)`}
          </span>
          {splitMode && selectedCount > 0 && (
            <button
              onClick={() => setSelected(new Map())}
              className="text-primary font-medium"
            >
              Auswahl aufheben
            </button>
          )}
        </div>
        {summary.items.map((item: any) => {
          const undelivered = item.status !== DELIVERED_STATUS;
          const sel = selected.get(item.id) ?? 0;
          const isSelected = sel > 0;
          return (
            <div
              key={item.id}
              className={`flex justify-between items-center px-4 py-2.5 border-b border-slate-100 last:border-b-0 ${isSelected ? 'bg-primary/5' : undelivered ? 'bg-amber-50/50' : ''}`}
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                {splitMode && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => setQty(item.id, sel - 1, item.quantity)}
                      disabled={sel === 0}
                      className="w-8 h-8 rounded-full border border-slate-300 flex items-center justify-center disabled:opacity-30"
                    >
                      <Minus size={14} />
                    </button>
                    <span className="w-8 text-center text-sm font-semibold tabular-nums">
                      {sel}/{item.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => setQty(item.id, sel + 1, item.quantity)}
                      disabled={sel >= item.quantity}
                      className="w-8 h-8 rounded-full border border-slate-300 flex items-center justify-center disabled:opacity-30"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                )}
                <div className="min-w-0">
                  <span className="font-medium text-sm">{item.quantity}x {item.item_name}</span>
                  {undelivered && (
                    <span className="ml-2 inline-flex items-center gap-1 text-xs text-amber-700">
                      <AlertTriangle size={12} /> {statusLabel[item.status] ?? item.status}
                    </span>
                  )}
                  {item.notes && <div className="text-xs text-slate-400">{item.notes}</div>}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-medium text-sm">
                  {(item.unit_price * item.quantity).toFixed(2).replace('.', ',')} &euro;
                </span>
                {!splitMode && (
                  <button
                    type="button"
                    onClick={() => handleCancelItem(item)}
                    title="Stornieren"
                    className="w-7 h-7 rounded-full border border-red-200 text-red-500 hover:bg-red-50 flex items-center justify-center"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Split toggle */}
      {hasItems && !splitMode && (
        <Button
          variant="ghost"
          size="md"
          className="w-full mb-4"
          onClick={() => setSplitMode(true)}
        >
          <span className="flex items-center justify-center gap-2">
            <Split size={16} /> Rechnung splitten
          </span>
        </Button>
      )}

      {splitMode && (
        <div className="bg-primary/5 border border-primary/30 rounded-xl p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-sm font-medium">Teilrechnung: {selectedCount} Stück</div>
              <div className="text-xs text-slate-500">
                Nach dem Abrechnen verschwinden diese Posten aus der Liste.
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-500">Auswahl-Summe</div>
              <div className="font-bold">{selectedSubtotal.toFixed(2).replace('.', ',')} &euro;</div>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="md"
                className="flex-1"
                onClick={() => handleSplit(false)}
                disabled={splitting || selectedCount === 0}
              >
                {splitting ? 'Wird gespeichert...' : 'Ohne Druck'}
              </Button>
              <Button
                onClick={() => handleSplit(true)}
                disabled={splitting || selectedCount === 0}
                size="md"
                variant="primary"
                className="flex-1"
              >
                <span className="flex items-center justify-center gap-2">
                  <Printer size={16} />
                  {splitting ? 'Wird gedruckt...' : 'Mit Druck'}
                </span>
              </Button>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => { setSplitMode(false); setSelected(new Map()); }}
            >
              Abbrechen
            </Button>
          </div>
        </div>
      )}

      {/* Subtotal */}
      <div className="flex justify-between items-center mb-3 px-1">
        <span className="text-slate-600">Zwischensumme</span>
        <span className="font-semibold">{summary.subtotal.toFixed(2).replace('.', ',')} &euro;</span>
      </div>

      {/* Discount */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4">
        <div className="text-sm font-medium mb-2">Rabatt</div>
        <div className="flex gap-2 mb-3">
          <button
            onClick={() => setDiscountType(discountType === 'percentage' ? null : 'percentage')}
            className={`flex-1 py-2 rounded-lg border text-sm font-medium flex items-center justify-center gap-1 ${
              discountType === 'percentage' ? 'border-primary bg-primary/10 text-primary' : 'border-slate-200'
            }`}
          >
            <Percent size={14} /> Prozent
          </button>
          <button
            onClick={() => setDiscountType(discountType === 'fixed' ? null : 'fixed')}
            className={`flex-1 py-2 rounded-lg border text-sm font-medium flex items-center justify-center gap-1 ${
              discountType === 'fixed' ? 'border-primary bg-primary/10 text-primary' : 'border-slate-200'
            }`}
          >
            <Euro size={14} /> Betrag
          </button>
        </div>
        {discountType && (
          <input
            type="number"
            min="0"
            step={discountType === 'percentage' ? '1' : '0.5'}
            max={discountType === 'percentage' ? '100' : summary.subtotal}
            value={discountValue || ''}
            onChange={e => setDiscountValue(parseFloat(e.target.value) || 0)}
            placeholder={discountType === 'percentage' ? 'z.B. 10' : 'z.B. 5.00'}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-lg"
          />
        )}
      </div>

      {/* Total */}
      <div className="flex justify-between items-center mb-4 px-1">
        <span className="text-lg font-bold">Gesamt</span>
        <span className="text-2xl font-bold text-primary">
          {getTotal().toFixed(2).replace('.', ',')} &euro;
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <Button
          onClick={() => handleSettle(false)}
          disabled={settling || !hasItems || splitMode}
          size="lg"
          variant="ghost"
          className="w-full"
        >
          {settling ? 'Abrechnen...' : 'Bezahlen (ohne Druck)'}
        </Button>
        <Button
          onClick={() => handleSettle(true)}
          disabled={settling || !hasItems || splitMode}
          size="lg"
          variant="success"
          className="w-full"
        >
          <span className="flex items-center justify-center gap-2">
            <Printer size={16} />
            {settling ? 'Abrechnen...' : hasItems ? 'Bezahlen & Drucken' : 'Keine offenen Posten'}
          </span>
        </Button>
      </div>
    </div>
  );
}

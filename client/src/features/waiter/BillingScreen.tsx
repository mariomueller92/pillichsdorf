import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as billingApi from '@/api/billing.api';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { toast } from 'sonner';
import { ArrowLeft, Percent, Euro, AlertTriangle, Printer } from 'lucide-react';

const DELIVERED_STATUS = 'serviert';
const statusLabel: Record<string, string> = {
  neu: 'noch nicht bestaetigt',
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
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [splitting, setSplitting] = useState(false);

  const reload = async () => {
    if (!tischId) return;
    const data = await billingApi.getTableSummary(parseInt(tischId));
    setSummary(data);
    setSelected(new Set());
    setLoading(false);
    return data;
  };

  useEffect(() => {
    reload();
  }, [tischId]);

  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectedSubtotal = summary?.items
    .filter((i: any) => selected.has(i.id))
    .reduce((s: number, i: any) => s + i.unit_price * i.quantity, 0) ?? 0;

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

  const handleSettle = async () => {
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
      });
      toast.success('Tisch abgerechnet!');
      navigate('/tische');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Fehler bei Abrechnung');
    } finally {
      setSettling(false);
    }
  };

  const handleSplit = async () => {
    if (!tischId || selected.size === 0) return;
    setSplitting(true);
    try {
      await billingApi.settleItems({
        table_id: parseInt(tischId),
        order_item_ids: Array.from(selected),
        discount_type: discountType,
        discount_value: discountValue,
        print_bon: true,
      });
      toast.success('Teilrechnung gedruckt');
      const next = await reload();
      if (next && next.items.length === 0) {
        toast.success('Alle Positionen abgerechnet');
        navigate('/tische');
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

      {/* Warning: undelivered items */}
      {undeliveredItems.length > 0 && (
        <div className="bg-amber-50 border border-amber-300 text-amber-900 rounded-xl p-3 mb-4 flex gap-2">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <div className="text-sm">
            <div className="font-semibold">
              {undeliveredItems.length} Position(en) noch nicht serviert
            </div>
            <div>Beim Abrechnen muss der Mitarbeiter das explizit bestaetigen.</div>
          </div>
        </div>
      )}

      {/* Items */}
      <div className="bg-white rounded-xl border border-slate-200 mb-4">
        <div className="px-4 py-2 border-b border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span>Zum Splitten Positionen anhaken</span>
          {selected.size > 0 && (
            <button
              onClick={() => setSelected(new Set())}
              className="text-primary font-medium"
            >
              Auswahl aufheben
            </button>
          )}
        </div>
        {summary.items.map((item: any) => {
          const undelivered = item.status !== DELIVERED_STATUS;
          const isSelected = selected.has(item.id);
          return (
            <label
              key={item.id}
              className={`flex justify-between items-center px-4 py-2.5 border-b border-slate-100 last:border-b-0 cursor-pointer ${isSelected ? 'bg-primary/5' : undelivered ? 'bg-amber-50/50' : ''}`}
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleSelect(item.id)}
                  className="w-5 h-5 accent-primary shrink-0"
                />
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
              <span className="font-medium text-sm shrink-0">
                {(item.unit_price * item.quantity).toFixed(2).replace('.', ',')} &euro;
              </span>
            </label>
          );
        })}
      </div>

      {/* Split action */}
      {selected.size > 0 && (
        <div className="bg-primary/5 border border-primary/30 rounded-xl p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-sm font-medium">Teilrechnung: {selected.size} Position(en)</div>
              <div className="text-xs text-slate-500">
                Nach dem Drucken verschwinden diese Posten aus der Liste.
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-500">Auswahl-Summe</div>
              <div className="font-bold">{selectedSubtotal.toFixed(2).replace('.', ',')} &euro;</div>
            </div>
          </div>
          <Button
            onClick={handleSplit}
            disabled={splitting}
            size="md"
            variant="primary"
            className="w-full"
          >
            <span className="flex items-center justify-center gap-2">
              <Printer size={16} />
              {splitting ? 'Wird gedruckt...' : 'Teilrechnung drucken'}
            </span>
          </Button>
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

      <Button onClick={handleSettle} disabled={settling || summary.items.length === 0} size="lg" variant="success" className="w-full">
        {settling ? 'Abrechnen...' : 'Bezahlt - Abschliessen'}
      </Button>
    </div>
  );
}

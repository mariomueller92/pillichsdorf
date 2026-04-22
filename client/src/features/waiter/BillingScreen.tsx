import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as billingApi from '@/api/billing.api';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { toast } from 'sonner';
import { ArrowLeft, Percent, Euro } from 'lucide-react';

export function BillingScreen() {
  const { tischId } = useParams<{ tischId: string }>();
  const navigate = useNavigate();
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed' | null>(null);
  const [discountValue, setDiscountValue] = useState(0);
  const [settling, setSettling] = useState(false);

  useEffect(() => {
    if (!tischId) return;
    billingApi.getTableSummary(parseInt(tischId)).then(data => {
      setSummary(data);
      setLoading(false);
    });
  }, [tischId]);

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

  const handleSettle = async () => {
    if (!tischId) return;
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

  if (loading) return <div className="flex items-center justify-center h-64"><Spinner /></div>;
  if (!summary) return <div className="p-4">Keine Daten</div>;

  return (
    <div className="p-4">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => navigate(-1)} className="p-1"><ArrowLeft size={20} /></button>
        <h1 className="text-xl font-bold">Abrechnung - Tisch {tischId}</h1>
      </div>

      {/* Items */}
      <div className="bg-white rounded-xl border border-slate-200 mb-4">
        {summary.items.map((item: any) => (
          <div key={item.id} className="flex justify-between items-center px-4 py-2.5 border-b border-slate-100 last:border-b-0">
            <div>
              <span className="font-medium text-sm">{item.quantity}x {item.item_name}</span>
              {item.notes && <div className="text-xs text-slate-400">{item.notes}</div>}
            </div>
            <span className="font-medium text-sm">
              {(item.unit_price * item.quantity).toFixed(2).replace('.', ',')} &euro;
            </span>
          </div>
        ))}
      </div>

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

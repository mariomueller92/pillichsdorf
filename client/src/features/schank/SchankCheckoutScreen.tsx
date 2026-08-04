import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as billingApi from '@/api/billing.api';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { toast } from 'sonner';
import { ArrowLeft, Printer } from 'lucide-react';

export function SchankCheckoutScreen() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const paymentMode = useAuthStore(s => s.user?.payment_mode) ?? 'bargeld';
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [settling, setSettling] = useState(false);

  useEffect(() => {
    if (!orderId) return;
    billingApi.getOrderSummary(parseInt(orderId))
      .then(setSummary)
      .catch(() => toast.error('Fehler beim Laden der Zusammenfassung'))
      .finally(() => setLoading(false));
  }, [orderId]);

  const isJeton = paymentMode === 'jeton';

  const handleSettle = async (withPrint: boolean) => {
    if (!orderId) return;
    setSettling(true);
    try {
      await billingApi.settleOrder(parseInt(orderId), { print_bon: withPrint });
      toast.success(withPrint ? 'Kassiert & Bon gedruckt' : 'Kassiert');
      navigate('/schank/verkauf');
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
        <button onClick={() => navigate('/schank/verkauf')} className="p-1"><ArrowLeft size={20} /></button>
        <h1 className="text-xl font-bold">Kassa</h1>
      </div>

      {/* Items */}
      <div className="bg-white rounded-xl border border-slate-200 mb-4">
        <div className="px-4 py-2 border-b border-slate-100 text-xs text-slate-500">
          {summary.items.length} Position(en)
        </div>
        {summary.items.map((item: any) => (
          <div key={item.id} className="flex justify-between items-center px-4 py-2.5 border-b border-slate-100 last:border-b-0">
            <div className="min-w-0">
              <span className="font-medium text-sm">{item.quantity}x {item.item_name}</span>
              {isJeton && (
                item.jeton_type_id != null ? (
                  <span className="ml-2 inline-flex items-center gap-1 text-xs text-slate-500">
                    <span className="w-2.5 h-2.5 rounded-full inline-block border border-slate-200" style={{ background: item.jeton_color }} />
                    {item.jeton_name}
                  </span>
                ) : (
                  <span className="ml-2 text-xs text-amber-700">kein Jeton zugeordnet</span>
                )
              )}
              {item.notes && <div className="text-xs text-slate-400">{item.notes}</div>}
            </div>
            <span className="font-medium text-sm shrink-0">
              {isJeton
                ? (item.jeton_type_id != null ? `${item.quantity}x` : `${(item.unit_price * item.quantity).toFixed(2).replace('.', ',')} €`)
                : `${(item.unit_price * item.quantity).toFixed(2).replace('.', ',')} €`}
            </span>
          </div>
        ))}
      </div>

      {/* Subtotal / Jeton breakdown */}
      {isJeton ? (
        <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4">
          <div className="text-sm font-medium mb-2">Fällige Jetons</div>
          {summary.jeton_breakdown.length === 0 && !summary.jeton_unassigned ? (
            <div className="text-slate-400 text-sm">Keine Positionen</div>
          ) : (
            <div className="flex flex-col gap-1">
              {summary.jeton_breakdown.map((b: any) => (
                <div key={b.jeton_type_id} className="flex items-center justify-between py-1">
                  <span className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full inline-block border border-slate-200" style={{ background: b.color }} />
                    {b.name}
                  </span>
                  <span className="font-bold tabular-nums">{b.count}x</span>
                </div>
              ))}
              {summary.jeton_unassigned && (
                <div className="text-xs text-amber-700 mt-1">
                  {summary.jeton_unassigned.count} Position(en) ohne Jeton-Zuordnung – wird in EUR verrechnet ({summary.jeton_unassigned.eur.toFixed(2).replace('.', ',')} &euro;)
                </div>
              )}
            </div>
          )}
          <div className="flex justify-between items-center mt-3 pt-3 border-t border-slate-100">
            <span className="text-xs text-slate-400">entspricht</span>
            <span className="text-sm text-slate-400">{summary.subtotal.toFixed(2).replace('.', ',')} &euro;</span>
          </div>
        </div>
      ) : (
        <div className="flex justify-between items-center mb-4 px-1">
          <span className="text-lg font-bold">Gesamt</span>
          <span className="text-2xl font-bold text-primary">
            {summary.subtotal.toFixed(2).replace('.', ',')} &euro;
          </span>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Button
          onClick={() => handleSettle(false)}
          disabled={settling}
          size="lg"
          variant="ghost"
          className="w-full"
        >
          {settling ? 'Kassiere...' : 'Bezahlt (ohne Druck)'}
        </Button>
        <Button
          onClick={() => handleSettle(true)}
          disabled={settling}
          size="lg"
          variant="success"
          className="w-full"
        >
          <span className="flex items-center justify-center gap-2">
            <Printer size={16} />
            {settling ? 'Kassiere...' : 'Bezahlt & Drucken'}
          </span>
        </Button>
      </div>
    </div>
  );
}

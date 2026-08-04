import { useEffect, useMemo, useState } from 'react';
import { useMenuStore } from '@/stores/menuStore';
import { useOrdersStore } from '@/stores/ordersStore';
import * as jetonTypesApi from '@/api/jetonTypes.api';
import * as ordersApi from '@/api/orders.api';
import * as billingApi from '@/api/billing.api';
import { JetonType, MenuItem, Order } from '@/types';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { JetonBreakdownList } from '@/components/JetonBreakdownList';
import { jetonEurSubtotal, computeJetonBreakdown } from '@/utils/jeton';
import { toast } from 'sonner';
import { ShoppingCart, Minus, Plus, Trash2, Delete, AlertCircle } from 'lucide-react';

const FALLBACK_COLOR = '#94a3b8';
const NOTES = [5, 10, 20, 50, 100];

export function KassaSpkScreen() {
  const { categories, items, isLoaded, fetchMenu } = useMenuStore();
  const { cart, addToCart, removeFromCart, updateCartQuantity, clearCart, submitOrder } = useOrdersStore();
  const [jetonTypes, setJetonTypes] = useState<JetonType[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [stage, setStage] = useState<'grid' | 'confirm' | 'payment' | 'result'>('grid');
  const [order, setOrder] = useState<Order | null>(null);
  const [summary, setSummary] = useState<any>(null);
  const [received, setReceived] = useState(0);
  const [settling, setSettling] = useState(false);
  const [billResult, setBillResult] = useState<any>(null);
  const [stornoLoading, setStornoLoading] = useState(false);

  useEffect(() => {
    if (!isLoaded) fetchMenu();
    jetonTypesApi.getJetonTypes().then(setJetonTypes).catch(() => {});
  }, [isLoaded]);

  const categoriesById = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories]);
  const jetonTypesById = useMemo(() => new Map(jetonTypes.map(jt => [jt.id, jt])), [jetonTypes]);

  const sortedItems = useMemo(() => {
    return items
      .filter(i => i.is_available)
      .slice()
      .sort((a, b) => {
        const sortA = categoriesById.get(a.category_id)?.sort_order ?? 0;
        const sortB = categoriesById.get(b.category_id)?.sort_order ?? 0;
        if (sortA !== sortB) return sortA - sortB;
        return a.sort_order - b.sort_order;
      });
  }, [items, categoriesById]);

  const itemColor = (item: MenuItem) =>
    item.jeton_type_id != null ? (jetonTypesById.get(item.jeton_type_id)?.color ?? FALLBACK_COLOR) : FALLBACK_COLOR;

  const cartJetonBreakdown = useMemo(() => computeJetonBreakdown(cart.map(c => {
    const jt = c.jeton_type_id != null ? jetonTypesById.get(c.jeton_type_id) : undefined;
    return {
      jeton_type_id: c.jeton_type_id,
      jeton_name: jt?.name,
      jeton_color: jt?.color,
      jeton_value: jt?.value,
      unit_price: c.price,
      quantity: c.quantity,
    };
  })), [cart, jetonTypesById]);

  const handleAddItem = (item: MenuItem) => {
    const target = categoriesById.get(item.category_id)?.target ?? 'kueche';
    addToCart(item, target);
  };

  const resetAll = () => {
    setStage('grid');
    setOrder(null);
    setSummary(null);
    setBillResult(null);
    setReceived(0);
  };

  const handleTakeOrder = async () => {
    if (cart.length === 0) return;
    setSubmitting(true);
    try {
      const created = await submitOrder(null);
      const s = await billingApi.getOrderSummary(created.id);
      setOrder(created);
      setSummary(s);
      setShowCart(false);
      setStage('confirm');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Fehler beim Aufnehmen der Bestellung');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStorno = async () => {
    if (!order) return;
    setStornoLoading(true);
    try {
      await ordersApi.cancelOrder(order.id);
      toast.success('Bestellung storniert');
      resetAll();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Storno fehlgeschlagen');
    } finally {
      setStornoLoading(false);
    }
  };

  const gesamtsumme = jetonEurSubtotal(summary ?? {});

  const handleConfirmPayment = async () => {
    if (!order || received < gesamtsumme) return;
    setSettling(true);
    try {
      const bill = await billingApi.settleOrder(order.id, { print_bon: false });
      setBillResult(bill);
      setStage('result');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Fehler bei der Abrechnung');
    } finally {
      setSettling(false);
    }
  };

  if (!isLoaded) return <div className="flex items-center justify-center h-64"><Spinner /></div>;

  const cartCount = cart.reduce((sum, c) => sum + c.quantity, 0);

  return (
    <div className="flex flex-col" style={{ height: 'calc(100dvh - 7rem)' }}>
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3 shrink-0">
        <h1 className="text-lg font-bold flex-1">Kassa</h1>
        {cartCount > 0 && (
          <button onClick={() => setShowCart(true)} className="relative p-2 rounded-lg hover:bg-slate-100">
            <ShoppingCart size={20} />
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-primary text-white rounded-full text-xs flex items-center justify-center">
              {cartCount}
            </span>
          </button>
        )}
      </div>

      {sortedItems.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8">
          <AlertCircle size={48} className="mb-3" />
          <p className="text-lg font-medium">Keine Speisekarte vorhanden</p>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {sortedItems.map(item => {
            const inCart = cart.find(c => c.menu_item_id === item.id);
            return (
              <button
                key={item.id}
                onClick={() => handleAddItem(item)}
                style={{ background: itemColor(item) }}
                className="relative rounded-2xl p-4 min-h-[96px] flex items-center justify-center text-center
                  shadow-sm active:scale-95 transition-all"
              >
                <span className="text-white font-bold text-base leading-tight [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
                  {item.name}
                </span>
                {inCart && (
                  <span className="absolute -top-2 -right-2 w-7 h-7 bg-white text-slate-900 rounded-full flex items-center justify-center text-sm font-bold shadow border border-slate-200">
                    {inCart.quantity}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {cartCount > 0 && (
        <div
          onClick={() => setShowCart(true)}
          className="shrink-0 mx-3 mb-2 bg-primary text-white rounded-xl px-4 py-3 flex items-center justify-between cursor-pointer active:scale-[0.98] transition-transform shadow-lg"
        >
          <div className="flex items-center gap-2">
            <ShoppingCart size={20} />
            <span className="font-medium">{cartCount} Artikel</span>
          </div>
          <span className="font-bold text-sm">Jetons ansehen &rarr;</span>
        </div>
      )}

      <Modal open={showCart} onClose={() => setShowCart(false)} title={`Warenkorb (${cartCount})`}>
        <div className="flex flex-col gap-3">
          {cart.map(item => {
            const jt = item.jeton_type_id != null ? jetonTypesById.get(item.jeton_type_id) : undefined;
            return (
            <div key={item.menu_item_id} className="flex items-center gap-3 bg-slate-50 rounded-lg p-3">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm">{item.name}</div>
                {jt ? (
                  <div className="text-sm text-slate-500 flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full inline-block border border-slate-200" style={{ background: jt.color }} />
                    {jt.name}
                  </div>
                ) : (
                  <div className="text-sm text-amber-700">kein Jeton zugeordnet</div>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => updateCartQuantity(item.menu_item_id, item.quantity - 1)}
                  className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center active:scale-90"
                >
                  <Minus size={16} />
                </button>
                <span className="w-7 text-center font-bold text-lg">{item.quantity}</span>
                <button
                  onClick={() => updateCartQuantity(item.menu_item_id, item.quantity + 1)}
                  className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center active:scale-90"
                >
                  <Plus size={16} />
                </button>
                <button
                  onClick={() => removeFromCart(item.menu_item_id)}
                  className="w-9 h-9 rounded-full bg-red-100 text-danger flex items-center justify-center active:scale-90 ml-1"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
            );
          })}

          <div className="py-2 border-t border-slate-200">
            <span className="font-semibold block mb-1.5">Jetons:</span>
            <JetonBreakdownList breakdown={cartJetonBreakdown.breakdown} unassigned={cartJetonBreakdown.unassigned} />
          </div>

          <div className="flex gap-2">
            <Button variant="danger" onClick={() => { clearCart(); setShowCart(false); }} className="flex-1">
              Leeren
            </Button>
            <Button variant="success" onClick={handleTakeOrder} disabled={submitting} className="flex-2" size="lg">
              {submitting ? 'Wird aufgenommen...' : 'Bestellung aufnehmen'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Confirm-Overlay */}
      {stage === 'confirm' && summary && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col p-5">
          <h2 className="text-xl font-bold mb-4">Bestellung aufgenommen</h2>
          <div className="flex-1 overflow-y-auto">
            <div className="bg-slate-50 rounded-xl p-3 mb-4 space-y-1">
              {summary.items.map((i: any) => (
                <div key={i.id} className="flex justify-between text-sm">
                  <span>{i.quantity}x {i.item_name}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-between items-center mb-4">
              <span className="text-lg font-bold">Gesamtsumme</span>
              <span className="text-3xl font-bold text-primary">{gesamtsumme.toFixed(2).replace('.', ',')} &euro;</span>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="text-sm font-medium mb-2">Auszugebende Jetons</div>
              <JetonBreakdownList breakdown={summary.jeton_breakdown ?? []} unassigned={summary.jeton_unassigned ?? null} />
            </div>
          </div>
          <div className="flex gap-2 pt-4 shrink-0">
            <Button variant="danger" size="lg" className="flex-1" onClick={handleStorno} disabled={stornoLoading}>
              {stornoLoading ? 'Storniere...' : 'Storno'}
            </Button>
            <Button variant="success" size="lg" className="flex-[2]" onClick={() => setStage('payment')}>
              Bezahlen
            </Button>
          </div>
        </div>
      )}

      {/* Payment-Overlay */}
      {stage === 'payment' && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col p-5">
          <h2 className="text-xl font-bold mb-4">Bezahlen</h2>
          <div className="flex-1 overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <span className="text-slate-600">Gesamtsumme</span>
              <span className="text-2xl font-bold">{gesamtsumme.toFixed(2).replace('.', ',')} &euro;</span>
            </div>

            <div className="bg-slate-50 rounded-xl p-4 mb-4 text-center">
              <div className="text-sm text-slate-500 mb-1">Erhaltener Betrag</div>
              <div className="text-4xl font-bold tabular-nums">{received.toFixed(2).replace('.', ',')} &euro;</div>
            </div>

            <div className="grid grid-cols-5 gap-2 mb-3">
              {NOTES.map(n => (
                <button
                  key={n}
                  onClick={() => setReceived(r => Math.round((r + n) * 100) / 100)}
                  className="rounded-xl border border-slate-300 bg-white py-3 font-semibold hover:bg-slate-50 active:scale-95"
                >
                  {n}&euro;
                </button>
              ))}
            </div>

            <div className="flex gap-2 mb-4">
              <input
                type="number"
                min="0"
                step="0.5"
                value={received || ''}
                onChange={e => setReceived(parseFloat(e.target.value) || 0)}
                placeholder="Betrag eintippen"
                className="flex-1 border border-slate-300 rounded-lg px-3 py-2.5 text-lg"
              />
              <button
                onClick={() => setReceived(0)}
                className="px-4 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 active:scale-95"
                title="Zurücksetzen"
              >
                <Delete size={18} />
              </button>
            </div>

            {received > 0 && received < gesamtsumme && (
              <p className="text-amber-700 text-sm">Betrag zu niedrig</p>
            )}
          </div>
          <div className="flex gap-2 pt-4 shrink-0">
            <Button variant="ghost" size="lg" onClick={() => setStage('confirm')}>
              Zurück
            </Button>
            <Button
              variant="success"
              size="lg"
              className="flex-1"
              onClick={handleConfirmPayment}
              disabled={settling || received < gesamtsumme}
            >
              {settling ? 'Wird verbucht...' : 'Bestätigen'}
            </Button>
          </div>
        </div>
      )}

      {/* Result-Overlay */}
      {stage === 'result' && billResult && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col p-5">
          <h2 className="text-xl font-bold mb-4">Bezahlt</h2>
          <div className="flex-1 overflow-y-auto">
            <div className="flex justify-between items-center mb-2">
              <span className="text-slate-600">Gesamtsumme</span>
              <span className="text-2xl font-bold">{billResult.total.toFixed(2).replace('.', ',')} &euro;</span>
            </div>
            <div className="flex justify-between items-center mb-4">
              <span className="text-slate-600">Restgeld</span>
              <span className="text-2xl font-bold text-success">
                {Math.max(0, received - billResult.total).toFixed(2).replace('.', ',')} &euro;
              </span>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="text-sm font-medium mb-2">Auszugebende Jetons</div>
              <JetonBreakdownList breakdown={billResult.jeton_breakdown ?? []} unassigned={billResult.jeton_unassigned ?? null} />
            </div>
          </div>
          <div className="pt-4 shrink-0">
            <Button variant="success" size="lg" className="w-full" onClick={resetAll}>
              Neue Bestellung
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMenuStore } from '@/stores/menuStore';
import { useOrdersStore } from '@/stores/ordersStore';
import { MenuItem } from '@/types';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { Modal } from '@/components/ui/Modal';
import { ShoppingCart, Minus, Plus, Trash2, ArrowLeft, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

export function OrderScreen() {
  const { tischId } = useParams<{ tischId: string }>();
  const navigate = useNavigate();
  const { categories, items, isLoaded, fetchMenu, getItemsByCategory } = useMenuStore();
  const { cart, addToCart, removeFromCart, updateCartQuantity, updateCartItemNotes, clearCart, getCartTotal, submitOrder } = useOrdersStore();
  const [activeCategory, setActiveCategory] = useState<number | null>(null);
  const [showCart, setShowCart] = useState(false);
  const [orderNotes, setOrderNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [editingNotes, setEditingNotes] = useState<number | null>(null);

  const isBarOrder = !tischId;
  const tableId = tischId ? parseInt(tischId) : null;

  useEffect(() => {
    if (!isLoaded) fetchMenu();
  }, [isLoaded]);

  useEffect(() => {
    if (categories.length > 0 && activeCategory === null) {
      setActiveCategory(categories[0].id);
    }
  }, [categories, activeCategory]);

  const handleAddItem = (item: MenuItem) => {
    const cat = categories.find(c => c.id === item.category_id);
    addToCart(item, cat?.target || 'kueche');
    toast.success(`${item.name} hinzugefügt`);
  };

  const handleSubmit = async () => {
    if (cart.length === 0) return;
    setSubmitting(true);
    try {
      await submitOrder(isBarOrder ? null : tableId, orderNotes || undefined);
      toast.success('Bestellung gesendet!');
      setShowCart(false);
      navigate('/tische');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Fehler beim Senden');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isLoaded) return <div className="flex items-center justify-center h-64"><Spinner /></div>;

  const categoryItems = activeCategory ? getItemsByCategory(activeCategory) : [];
  const cartTotal = getCartTotal();
  const cartCount = cart.reduce((sum, c) => sum + c.quantity, 0);

  return (
    <div className="flex flex-col" style={{ height: 'calc(100dvh - 7rem)' }}>
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3 shrink-0">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-lg hover:bg-slate-100 active:scale-90">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-bold flex-1">
          {isBarOrder ? 'Barverkauf' : `Tisch ${tischId} - Bestellung`}
        </h1>
        {cartCount > 0 && (
          <button onClick={() => setShowCart(true)} className="relative p-2 rounded-lg hover:bg-slate-100">
            <ShoppingCart size={20} />
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-primary text-white rounded-full text-xs flex items-center justify-center">
              {cartCount}
            </span>
          </button>
        )}
      </div>

      {/* Empty state */}
      {categories.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8">
          <AlertCircle size={48} className="mb-3" />
          <p className="text-lg font-medium">Keine Speisekarte vorhanden</p>
          <p className="text-sm">Bitte zuerst Kategorien und Artikel im Admin-Bereich anlegen.</p>
        </div>
      )}

      {/* Category tabs */}
      {categories.length > 0 && (
        <div className="bg-white border-b border-slate-200 overflow-x-auto shrink-0">
          <div className="flex gap-1 px-3 py-2">
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                  activeCategory === cat.id
                    ? 'bg-primary text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Items grid */}
      <div className="flex-1 overflow-y-auto p-3">
        {categoryItems.length === 0 && activeCategory && (
          <div className="text-center text-slate-400 py-8">
            <p>Keine Artikel in dieser Kategorie</p>
          </div>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {categoryItems.map(item => {
            const inCart = cart.find(c => c.menu_item_id === item.id);
            return (
              <button
                key={item.id}
                onClick={() => handleAddItem(item)}
                className="relative bg-white rounded-xl border border-slate-200 p-3 text-left
                  hover:border-primary/50 active:scale-95 transition-all shadow-sm"
              >
                <div className="font-medium text-sm mb-1 line-clamp-2">{item.name}</div>
                <div className="flex items-center gap-2">
                  <span className="text-primary font-bold">
                    {item.price.toFixed(2).replace('.', ',')} &euro;
                  </span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                    item.availability_mode === 'sofort'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-orange-100 text-orange-700'
                  }`}>
                    {item.availability_mode === 'sofort' ? 'Sofort' : 'Wartezeit'}
                  </span>
                </div>
                {inCart && (
                  <div className="absolute -top-2 -right-2 w-6 h-6 bg-primary text-white rounded-full flex items-center justify-center text-xs font-bold shadow">
                    {inCart.quantity}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Cart bar - fixed above bottom nav */}
      {cartCount > 0 && (
        <div
          onClick={() => setShowCart(true)}
          className="shrink-0 mx-3 mb-2 bg-primary text-white rounded-xl px-4 py-3 flex items-center justify-between cursor-pointer active:scale-[0.98] transition-transform shadow-lg"
        >
          <div className="flex items-center gap-2">
            <ShoppingCart size={20} />
            <span className="font-medium">{cartCount} Artikel</span>
          </div>
          <span className="font-bold text-lg">{cartTotal.toFixed(2).replace('.', ',')} &euro;</span>
        </div>
      )}

      {/* Cart modal */}
      <Modal open={showCart} onClose={() => setShowCart(false)} title={`Warenkorb (${cartCount})`}>
        <div className="flex flex-col gap-3">
          {cart.map(item => (
            <div key={item.menu_item_id} className="flex items-center gap-3 bg-slate-50 rounded-lg p-3">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm">{item.name}</div>
                <div className="text-sm text-slate-500">{item.price.toFixed(2).replace('.', ',')} &euro;</div>
                {editingNotes === item.menu_item_id ? (
                  <input
                    className="mt-1 text-xs border border-slate-300 rounded px-2 py-1 w-full"
                    placeholder="z.B. ohne Zwiebel..."
                    value={item.notes}
                    onChange={e => updateCartItemNotes(item.menu_item_id, e.target.value)}
                    onBlur={() => setEditingNotes(null)}
                    autoFocus
                  />
                ) : (
                  <button
                    onClick={() => setEditingNotes(item.menu_item_id)}
                    className="mt-1 text-xs text-primary hover:underline"
                  >
                    {item.notes || '+ Anmerkung'}
                  </button>
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
          ))}

          <textarea
            placeholder="Allgemeine Anmerkung zur Bestellung..."
            value={orderNotes}
            onChange={e => setOrderNotes(e.target.value)}
            className="border border-slate-300 rounded-lg p-2 text-sm resize-none h-16"
          />

          <div className="flex justify-between items-center py-2 border-t border-slate-200">
            <span className="font-semibold">Gesamt:</span>
            <span className="text-xl font-bold text-primary">{cartTotal.toFixed(2).replace('.', ',')} &euro;</span>
          </div>

          <div className="flex gap-2">
            <Button variant="danger" onClick={() => { clearCart(); setShowCart(false); }} className="flex-1">
              Leeren
            </Button>
            <Button variant="success" onClick={handleSubmit} disabled={submitting} className="flex-2" size="lg">
              {submitting ? 'Sende...' : 'Bestellung senden'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

import { useEffect, useState } from 'react';
import * as menuApi from '@/api/menu.api';
import { MenuCategory, MenuItem, CategoryTarget } from '@/types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight } from 'lucide-react';

export function MenuManagement() {
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [expandedCat, setExpandedCat] = useState<number | null>(null);

  // Category form
  const [showCatForm, setShowCatForm] = useState(false);
  const [editingCat, setEditingCat] = useState<MenuCategory | null>(null);
  const [catForm, setCatForm] = useState({ name: '', sort_order: 0, target: 'kueche' as CategoryTarget });

  // Item form
  const [showItemForm, setShowItemForm] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [itemForm, setItemForm] = useState({ category_id: 0, name: '', price: 0, sort_order: 0 });

  const fetch = async () => {
    const [cats, its] = await Promise.all([menuApi.getCategories(), menuApi.getItems()]);
    setCategories(cats);
    setItems(its);
  };

  useEffect(() => { fetch(); }, []);

  // Category handlers
  const openCreateCat = () => {
    setEditingCat(null);
    setCatForm({ name: '', sort_order: 0, target: 'kueche' });
    setShowCatForm(true);
  };

  const openEditCat = (cat: MenuCategory) => {
    setEditingCat(cat);
    setCatForm({ name: cat.name, sort_order: cat.sort_order, target: cat.target });
    setShowCatForm(true);
  };

  const saveCat = async () => {
    try {
      if (editingCat) {
        await menuApi.updateCategory(editingCat.id, catForm);
      } else {
        await menuApi.createCategory(catForm);
      }
      setShowCatForm(false);
      fetch();
      toast.success('Kategorie gespeichert');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Fehler');
    }
  };

  const deleteCat = async (id: number) => {
    if (!confirm('Kategorie deaktivieren?')) return;
    await menuApi.deleteCategory(id);
    fetch();
    toast.success('Kategorie deaktiviert');
  };

  // Item handlers
  const openCreateItem = (categoryId: number) => {
    setEditingItem(null);
    setItemForm({ category_id: categoryId, name: '', price: 0, sort_order: 0 });
    setShowItemForm(true);
  };

  const openEditItem = (item: MenuItem) => {
    setEditingItem(item);
    setItemForm({ category_id: item.category_id, name: item.name, price: item.price, sort_order: item.sort_order });
    setShowItemForm(true);
  };

  const saveItem = async () => {
    try {
      if (editingItem) {
        await menuApi.updateItem(editingItem.id, itemForm);
      } else {
        await menuApi.createItem(itemForm);
      }
      setShowItemForm(false);
      fetch();
      toast.success('Artikel gespeichert');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Fehler');
    }
  };

  const deleteItem = async (id: number) => {
    if (!confirm('Artikel deaktivieren?')) return;
    await menuApi.deleteItem(id);
    fetch();
    toast.success('Artikel deaktiviert');
  };

  const toggleAvail = async (id: number) => {
    await menuApi.toggleAvailability(id);
    fetch();
  };

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">Speisekarte</h1>
        <Button onClick={openCreateCat} size="sm">
          <span className="flex items-center gap-1"><Plus size={16} /> Kategorie</span>
        </Button>
      </div>

      <div className="space-y-2">
        {categories.map(cat => {
          const catItems = items.filter(i => i.category_id === cat.id);
          const isExpanded = expandedCat === cat.id;

          return (
            <div key={cat.id} className="bg-white rounded-lg border border-slate-200 overflow-hidden">
              <div
                className="flex items-center justify-between p-3 cursor-pointer hover:bg-slate-50"
                onClick={() => setExpandedCat(isExpanded ? null : cat.id)}
              >
                <div className="flex items-center gap-2">
                  {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  <span className="font-medium">{cat.name}</span>
                  <Badge variant={cat.target === 'kueche' ? 'warning' : 'info'}>
                    {cat.target === 'kueche' ? 'Kueche' : 'Schank'}
                  </Badge>
                  <span className="text-xs text-slate-400">{catItems.length} Artikel</span>
                </div>
                <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                  <button onClick={() => openEditCat(cat)} className="p-1.5 hover:bg-slate-100 rounded"><Pencil size={14} /></button>
                  <button onClick={() => deleteCat(cat.id)} className="p-1.5 hover:bg-red-50 rounded text-danger"><Trash2 size={14} /></button>
                </div>
              </div>

              {isExpanded && (
                <div className="border-t border-slate-100 px-3 pb-3">
                  {catItems.map(item => (
                    <div key={item.id} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-b-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm ${!item.is_available ? 'line-through text-slate-400' : ''}`}>{item.name}</span>
                        <span className="text-sm font-medium text-primary">{item.price.toFixed(2).replace('.', ',')} &euro;</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => toggleAvail(item.id)}
                          className={`text-xs px-2 py-0.5 rounded ${item.is_available ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}
                        >
                          {item.is_available ? 'Verfuegbar' : 'Ausverkauft'}
                        </button>
                        <button onClick={() => openEditItem(item)} className="p-1.5 hover:bg-slate-100 rounded"><Pencil size={14} /></button>
                        <button onClick={() => deleteItem(item.id)} className="p-1.5 hover:bg-red-50 rounded text-danger"><Trash2 size={14} /></button>
                      </div>
                    </div>
                  ))}
                  <Button onClick={() => openCreateItem(cat.id)} variant="ghost" size="sm" className="mt-2 w-full">
                    <span className="flex items-center gap-1"><Plus size={14} /> Artikel hinzufuegen</span>
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Category Form */}
      <Modal open={showCatForm} onClose={() => setShowCatForm(false)} title={editingCat ? 'Kategorie bearbeiten' : 'Neue Kategorie'}>
        <div className="flex flex-col gap-3">
          <Input label="Name" value={catForm.name} onChange={e => setCatForm({ ...catForm, name: e.target.value })} />
          <Input label="Reihenfolge" type="number" value={catForm.sort_order} onChange={e => setCatForm({ ...catForm, sort_order: parseInt(e.target.value) || 0 })} />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-700">Ziel</label>
            <select
              value={catForm.target}
              onChange={e => setCatForm({ ...catForm, target: e.target.value as CategoryTarget })}
              className="rounded-lg border border-slate-300 px-3 py-2.5"
            >
              <option value="kueche">Kueche</option>
              <option value="schank">Schank</option>
            </select>
          </div>
          <Button onClick={saveCat} size="lg">Speichern</Button>
        </div>
      </Modal>

      {/* Item Form */}
      <Modal open={showItemForm} onClose={() => setShowItemForm(false)} title={editingItem ? 'Artikel bearbeiten' : 'Neuer Artikel'}>
        <div className="flex flex-col gap-3">
          <Input label="Name" value={itemForm.name} onChange={e => setItemForm({ ...itemForm, name: e.target.value })} />
          <Input label="Preis (EUR)" type="number" step="0.1" min="0" value={itemForm.price || ''} onChange={e => setItemForm({ ...itemForm, price: parseFloat(e.target.value) || 0 })} />
          <Input label="Reihenfolge" type="number" value={itemForm.sort_order} onChange={e => setItemForm({ ...itemForm, sort_order: parseInt(e.target.value) || 0 })} />
          <Button onClick={saveItem} size="lg">Speichern</Button>
        </div>
      </Modal>
    </div>
  );
}

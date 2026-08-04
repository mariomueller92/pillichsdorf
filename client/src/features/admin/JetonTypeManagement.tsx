import { useEffect, useState } from 'react';
import * as jetonTypesApi from '@/api/jetonTypes.api';
import { JetonType } from '@/types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2 } from 'lucide-react';

const DEFAULT_COLOR = '#E53935';

export function JetonTypeManagement() {
  const [jetonTypes, setJetonTypes] = useState<JetonType[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<JetonType | null>(null);
  const [form, setForm] = useState({ name: '', color: DEFAULT_COLOR, value: 0, sort_order: 0 });

  const fetch = async () => {
    const data = await jetonTypesApi.getJetonTypes();
    setJetonTypes(data);
  };

  useEffect(() => { fetch(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', color: DEFAULT_COLOR, value: 0, sort_order: 0 });
    setShowForm(true);
  };

  const openEdit = (jt: JetonType) => {
    setEditing(jt);
    setForm({ name: jt.name, color: jt.color, value: jt.value, sort_order: jt.sort_order });
    setShowForm(true);
  };

  const save = async () => {
    try {
      if (editing) {
        await jetonTypesApi.updateJetonType(editing.id, form);
      } else {
        await jetonTypesApi.createJetonType(form);
      }
      setShowForm(false);
      fetch();
      toast.success('Jeton-Typ gespeichert');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Fehler');
    }
  };

  const remove = async (id: number) => {
    if (!confirm('Jeton-Typ deaktivieren?')) return;
    await jetonTypesApi.deleteJetonType(id);
    fetch();
    toast.success('Jeton-Typ deaktiviert');
  };

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">Jeton-Typen</h1>
        <Button onClick={openCreate} size="sm">
          <span className="flex items-center gap-1"><Plus size={16} /> Neu</span>
        </Button>
      </div>

      <div className="space-y-2">
        {jetonTypes.map(jt => (
          <div key={jt.id} className="bg-white rounded-lg border border-slate-200 p-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="w-5 h-5 rounded-full border border-slate-200 shrink-0" style={{ background: jt.color }} />
              <div>
                <div className="font-medium">{jt.name}</div>
                <div className="text-sm text-slate-500">{jt.value.toFixed(2).replace('.', ',')} &euro;</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => openEdit(jt)} className="p-2 hover:bg-slate-100 rounded">
                <Pencil size={16} />
              </button>
              <button onClick={() => remove(jt.id)} className="p-2 hover:bg-red-50 rounded text-danger">
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
        {jetonTypes.length === 0 && (
          <div className="text-slate-400 text-sm py-4 text-center">Noch keine Jeton-Typen angelegt</div>
        )}
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? 'Jeton-Typ bearbeiten' : 'Neuer Jeton-Typ'}>
        <div className="flex flex-col gap-3">
          <Input label="Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-700">Farbe</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={form.color}
                onChange={e => setForm({ ...form, color: e.target.value })}
                className="w-12 h-10 rounded border border-slate-300 cursor-pointer"
              />
              <Input
                value={form.color}
                onChange={e => setForm({ ...form, color: e.target.value })}
                className="flex-1"
                placeholder="#E53935"
              />
            </div>
          </div>
          <Input label="Wert (EUR)" type="number" step="0.5" min="0" value={form.value || ''} onChange={e => setForm({ ...form, value: parseFloat(e.target.value) || 0 })} />
          <Input label="Reihenfolge" type="number" value={form.sort_order} onChange={e => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })} />
          <Button onClick={save} size="lg">Speichern</Button>
        </div>
      </Modal>
    </div>
  );
}

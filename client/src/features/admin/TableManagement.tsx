import { useEffect, useState } from 'react';
import * as tablesApi from '@/api/tables.api';
import { Table } from '@/types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2 } from 'lucide-react';

export function TableManagement() {
  const [tables, setTables] = useState<Table[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Table | null>(null);
  const [form, setForm] = useState({ table_number: '', capacity: '', sort_order: '' });

  const fetch = async () => {
    const data = await tablesApi.getTables();
    setTables(data);
  };

  useEffect(() => { fetch(); }, []);

  const openCreate = () => {
    setEditing(null);
    const nextSort = tables.length > 0 ? Math.max(...tables.map(t => t.sort_order ?? 0)) + 10 : 10;
    setForm({ table_number: '', capacity: '', sort_order: String(nextSort) });
    setShowForm(true);
  };

  const openEdit = (table: Table) => {
    setEditing(table);
    setForm({
      table_number: table.table_number,
      capacity: table.capacity?.toString() || '',
      sort_order: String(table.sort_order ?? 0),
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    try {
      const body = {
        table_number: form.table_number,
        capacity: form.capacity ? parseInt(form.capacity) : null,
        sort_order: form.sort_order ? parseInt(form.sort_order) : 0,
      };
      if (editing) {
        await tablesApi.updateTable(editing.id, body);
      } else {
        await tablesApi.createTable(body);
      }
      setShowForm(false);
      fetch();
      toast.success('Tisch gespeichert');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Fehler');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Tisch deaktivieren?')) return;
    await tablesApi.deleteTable(id);
    fetch();
    toast.success('Tisch deaktiviert');
  };

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">Tischverwaltung</h1>
        <Button onClick={openCreate} size="sm">
          <span className="flex items-center gap-1"><Plus size={16} /> Neu</span>
        </Button>
      </div>

      <div className="space-y-2">
        {tables.map(table => (
          <div key={table.id} className="bg-white rounded-lg border border-slate-200 p-3 flex items-center justify-between">
            <div>
              <div className="font-medium">Tisch {table.table_number}</div>
              <div className="text-sm text-slate-500">
                {table.capacity ? `${table.capacity} Plätze` : 'Keine Angabe'}
                <span className="ml-2 text-xs text-slate-400">Sortierung: {table.sort_order ?? 0}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={table.status === 'frei' ? 'success' : 'danger'}>
                {table.status}
              </Badge>
              <button onClick={() => openEdit(table)} className="p-2 hover:bg-slate-100 rounded">
                <Pencil size={16} />
              </button>
              <button onClick={() => handleDelete(table.id)} className="p-2 hover:bg-red-50 rounded text-danger">
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? 'Tisch bearbeiten' : 'Neuer Tisch'}>
        <div className="flex flex-col gap-3">
          <Input
            label="Tischnummer"
            value={form.table_number}
            onChange={e => setForm({ ...form, table_number: e.target.value })}
            placeholder="z.B. 1, Terrasse 3"
          />
          <Input
            label="Anzahl Plätze (optional)"
            type="number"
            min="1"
            value={form.capacity}
            onChange={e => setForm({ ...form, capacity: e.target.value })}
          />
          <Input
            label="Sortierung (kleinere Zahl = früher)"
            type="number"
            value={form.sort_order}
            onChange={e => setForm({ ...form, sort_order: e.target.value })}
            placeholder="z.B. 10, 20, 30..."
          />
          <Button onClick={handleSave} size="lg">Speichern</Button>
        </div>
      </Modal>
    </div>
  );
}

import { useEffect, useState } from 'react';
import api from '@/api/client';
import { User, Role } from '@/types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2 } from 'lucide-react';

const roleLabels: Record<Role, string> = {
  admin: 'Admin',
  kellner: 'Kellner',
  kueche_schank: 'Kueche/Schank',
};

export function UserManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [form, setForm] = useState({ display_name: '', username: '', password: '', pin: '', role: 'kellner' as Role });

  const fetchUsers = async () => {
    const { data } = await api.get('/users');
    setUsers(data);
  };

  useEffect(() => { fetchUsers(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ display_name: '', username: '', password: '', pin: '', role: 'kellner' });
    setShowForm(true);
  };

  const openEdit = (user: User) => {
    setEditing(user);
    setForm({ display_name: user.display_name, username: user.username || '', password: '', pin: '', role: user.role });
    setShowForm(true);
  };

  const handleSave = async () => {
    try {
      const body: any = { display_name: form.display_name, role: form.role };
      if (form.username) body.username = form.username;
      if (form.password) body.password = form.password;
      if (form.pin) body.pin = form.pin;

      if (editing) {
        await api.put(`/users/${editing.id}`, body);
        toast.success('Benutzer aktualisiert');
      } else {
        await api.post('/users', body);
        toast.success('Benutzer erstellt');
      }
      setShowForm(false);
      fetchUsers();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Fehler beim Speichern');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Benutzer deaktivieren?')) return;
    await api.delete(`/users/${id}`);
    toast.success('Benutzer deaktiviert');
    fetchUsers();
  };

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">Benutzerverwaltung</h1>
        <Button onClick={openCreate} size="sm">
          <span className="flex items-center gap-1"><Plus size={16} /> Neu</span>
        </Button>
      </div>

      <div className="space-y-2">
        {users.map(user => (
          <div key={user.id} className={`bg-white rounded-lg border border-slate-200 p-3 flex items-center justify-between ${!user.is_active ? 'opacity-50' : ''}`}>
            <div>
              <div className="font-medium">{user.display_name}</div>
              <div className="text-sm text-slate-500">{user.username || 'Nur PIN'}</div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={user.role === 'admin' ? 'info' : user.role === 'kellner' ? 'success' : 'warning'}>
                {roleLabels[user.role]}
              </Badge>
              <button onClick={() => openEdit(user)} className="p-2 hover:bg-slate-100 rounded">
                <Pencil size={16} />
              </button>
              {user.is_active ? (
                <button onClick={() => handleDelete(user.id)} className="p-2 hover:bg-red-50 rounded text-danger">
                  <Trash2 size={16} />
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? 'Benutzer bearbeiten' : 'Neuer Benutzer'}>
        <div className="flex flex-col gap-3">
          <Input label="Anzeigename" value={form.display_name} onChange={e => setForm({ ...form, display_name: e.target.value })} />
          <Input label="Benutzername (optional)" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} />
          <Input label={editing ? 'Neues Passwort (leer lassen)' : 'Passwort'} type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
          <Input label={editing ? 'Neuer PIN (leer lassen)' : 'PIN (4 Ziffern)'} value={form.pin} maxLength={4} onChange={e => setForm({ ...form, pin: e.target.value.replace(/\D/g, '') })} />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-700">Rolle</label>
            <select
              value={form.role}
              onChange={e => setForm({ ...form, role: e.target.value as Role })}
              className="rounded-lg border border-slate-300 px-3 py-2.5"
            >
              <option value="kellner">Kellner</option>
              <option value="kueche_schank">Kueche/Schank</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <Button onClick={handleSave} size="lg">Speichern</Button>
        </div>
      </Modal>
    </div>
  );
}

import { useEffect, useState } from 'react';
import * as settingsApi from '@/api/settings.api';
import { Settings } from '@/types';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { toast } from 'sonner';

type FormState = Omit<Settings, 'id' | 'updated_at'>;

const EMPTY: FormState = {
  company_name: '',
  company_address1: '',
  company_address2: '',
  company_betriebsnummer: '',
  company_footer: '',
  printer_name: '',
  printer_width: 58,
};

export function SettingsManagement() {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    settingsApi.getSettings().then(s => {
      const { id, updated_at, ...rest } = s;
      setForm(rest);
      setLoading(false);
    });
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await settingsApi.updateSettings(form);
      toast.success('Einstellungen gespeichert');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Fehler beim Speichern');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-4 text-slate-400">Lädt...</div>;

  return (
    <div className="p-4 max-w-lg">
      <h1 className="text-xl font-bold mb-4">Einstellungen</h1>

      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4">
        <div className="text-sm font-semibold mb-3">Firma / Bon-Kopf</div>
        <div className="flex flex-col gap-3">
          <Input label="Firmenname" value={form.company_name} onChange={e => setForm({ ...form, company_name: e.target.value })} />
          <Input label="Adresse Zeile 1" value={form.company_address1} onChange={e => setForm({ ...form, company_address1: e.target.value })} />
          <Input label="Adresse Zeile 2" value={form.company_address2} onChange={e => setForm({ ...form, company_address2: e.target.value })} />
          <Input label="Betriebsnummer" value={form.company_betriebsnummer} onChange={e => setForm({ ...form, company_betriebsnummer: e.target.value })} />
          <Input label="Bon-Footer (Dankestext)" value={form.company_footer} onChange={e => setForm({ ...form, company_footer: e.target.value })} />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4">
        <div className="text-sm font-semibold mb-3">Drucker</div>
        <div className="flex flex-col gap-3">
          <Input label="Drucker-Name (Windows-Druckerwarteschlange)" value={form.printer_name} onChange={e => setForm({ ...form, printer_name: e.target.value })} />
          <Input label="Papierbreite (Zeichen pro Zeile)" type="number" min="20" value={form.printer_width || ''} onChange={e => setForm({ ...form, printer_width: parseInt(e.target.value) || 58 })} />
        </div>
      </div>

      <Button onClick={save} disabled={saving} size="lg" className="w-full">
        {saving ? 'Speichert...' : 'Speichern'}
      </Button>
    </div>
  );
}

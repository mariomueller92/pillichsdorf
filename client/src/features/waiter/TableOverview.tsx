import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTablesStore } from '@/stores/tablesStore';
import { useAuthStore } from '@/stores/authStore';
import { Table } from '@/types';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { Users, AlertCircle, Settings } from 'lucide-react';

export function TableOverview() {
  const { tables, fetchTables } = useTablesStore();
  const user = useAuthStore(s => s.user);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchTables().finally(() => setLoading(false));
  }, []);

  const handleTableClick = (table: Table) => {
    if (table.merged_into_id) return; // merged tables are not clickable
    if (table.status === 'frei') {
      navigate(`/bestellen/${table.id}`);
    } else {
      navigate(`/tisch/${table.id}`);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Spinner /></div>;
  }

  if (tables.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-400 p-8">
        <AlertCircle size={48} className="mb-3" />
        <p className="text-lg font-medium mb-2">Keine Tische vorhanden</p>
        {user?.role === 'admin' ? (
          <button
            onClick={() => navigate('/admin/tische')}
            className="flex items-center gap-2 text-primary hover:underline"
          >
            <Settings size={16} /> Tische in der Verwaltung anlegen
          </button>
        ) : (
          <p className="text-sm">Bitte den Administrator bitten, Tische anzulegen.</p>
        )}
      </div>
    );
  }

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">Tischuebersicht</h1>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {tables.filter(t => !t.merged_into_id).map(table => (
          <button
            key={table.id}
            onClick={() => handleTableClick(table)}
            className={`relative p-4 rounded-xl border-2 transition-all active:scale-95 text-left min-h-[5rem] ${
              table.status === 'frei'
                ? 'border-green-300 bg-green-50 hover:bg-green-100'
                : table.status === 'rechnung_angefordert'
                  ? 'border-red-500 bg-red-100 hover:bg-red-200 animate-pulse'
                  : 'border-orange-300 bg-orange-50 hover:bg-orange-100'
            }`}
          >
            <div className="text-2xl font-bold mb-1">
              Tisch {table.table_number}
            </div>
            <Badge variant={table.status === 'frei' ? 'success' : table.status === 'rechnung_angefordert' ? 'danger' : 'warning'}>
              {table.status === 'frei' ? 'Frei' : table.status === 'rechnung_angefordert' ? 'RECHNUNG' : 'Besetzt'}
            </Badge>
            {table.capacity && (
              <div className="flex items-center gap-1 mt-2 text-xs text-slate-500">
                <Users size={12} />
                <span>{table.capacity} Plaetze</span>
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as tablesApi from '@/api/tables.api';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { Modal } from '@/components/ui/Modal';
import { useTablesStore } from '@/stores/tablesStore';
import { useAuthStore } from '@/stores/authStore';
import { Table } from '@/types';
import * as ordersApi from '@/api/orders.api';
import * as dashboardApi from '@/api/dashboard.api';
import * as billingApi from '@/api/billing.api';
import { toast } from 'sonner';
import { Plus, ArrowRightLeft, Merge, Receipt, Bell, Truck, Clock, DoorOpen } from 'lucide-react';
import { formatDbTimeHM, minutesSince } from '@/utils/time';

const itemStatusBadge: Record<string, { label: string; variant: 'warning' | 'info' | 'success' | 'danger' | 'neutral' }> = {
  neu: { label: 'Warten', variant: 'warning' },
  in_zubereitung: { label: 'In Arbeit', variant: 'info' },
  fertig: { label: 'Bereit', variant: 'success' },
  serviert: { label: 'Geliefert', variant: 'neutral' },
};

const orderStatusBadge: Record<string, { label: string; variant: 'warning' | 'info' | 'success' | 'danger' | 'neutral' }> = {
  offen: { label: 'Offen', variant: 'warning' },
  in_bearbeitung: { label: 'In Arbeit', variant: 'info' },
  fertig: { label: 'Bereit', variant: 'success' },
  serviert: { label: 'Geliefert', variant: 'neutral' },
};

export function TableDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tableData, setTableData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showTransfer, setShowTransfer] = useState(false);
  const [showMerge, setShowMerge] = useState(false);
  const [now, setNow] = useState<number>(Date.now());
  const tables = useTablesStore(s => s.tables);
  const fetchTables = useTablesStore(s => s.fetchTables);
  const user = useAuthStore(s => s.user);
  const canSetWaiting = user?.role === 'kueche_schank' || user?.role === 'admin';

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(tick);
  }, []);

  const loadTable = async () => {
    if (!id) return;
    const data = await tablesApi.getTable(parseInt(id));
    setTableData(data);
    setLoading(false);
  };

  useEffect(() => {
    loadTable();
    fetchTables();
  }, [id]);

  const handleTransfer = async (targetTableId: number) => {
    if (!tableData?.orders?.length) {
      toast.error('Keine Bestellungen zu verschieben');
      return;
    }
    const movable = tableData.orders.filter((o: any) => o.status !== 'storniert');
    if (movable.length === 0) {
      toast.error('Keine Bestellungen zu verschieben');
      return;
    }
    try {
      for (const order of movable) {
        await ordersApi.transferOrder(order.id, targetTableId);
      }
      toast.success(`${movable.length} Bestellung(en) verschoben`);
      setShowTransfer(false);
      await fetchTables();
      navigate(`/tisch/${targetTableId}`);
    } catch {
      toast.error('Fehler beim Verschieben');
    }
  };

  const handleMerge = async (secondaryTableId: number) => {
    if (!id) return;
    await tablesApi.mergeTables(parseInt(id), [secondaryTableId]);
    setShowMerge(false);
    loadTable();
  };

  const handleSetItemStatus = async (orderId: number, itemId: number, status: 'serviert' | 'neu') => {
    try {
      await ordersApi.updateItemStatus(orderId, itemId, status);
      toast.success(status === 'serviert' ? 'Als geliefert markiert' : 'Auf Warten gesetzt');
      loadTable();
    } catch {
      toast.error('Fehler beim Aktualisieren');
    }
  };

  const handleSetOrderStatus = async (order: any, status: 'serviert' | 'neu') => {
    const items = (order.items ?? []).filter((i: any) => {
      if (i.status === 'storniert') return false;
      if (i.status === status) return false;
      return true;
    });
    if (items.length === 0) return;
    try {
      for (const item of items) {
        await ordersApi.updateItemStatus(order.id, item.id, status);
      }
      toast.success(status === 'serviert' ? 'Bestellung als geliefert markiert' : 'Bestellung auf Warten gesetzt');
      loadTable();
    } catch {
      toast.error('Fehler beim Aktualisieren');
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Spinner /></div>;
  if (!tableData) return <div className="p-4">Tisch nicht gefunden</div>;

  // Abrechnen ausgrauen wenn Tisch leer bzw. keine (noch nicht abgerechneten) Positionen
  // "serviert" zählt weiterhin als abzurechnen — es bedeutet nur "geliefert", nicht "bezahlt".
  const canSettle = tableData.status !== 'frei' && (tableData.orders ?? []).some((o: any) =>
    (o.items ?? []).some((i: any) => i.status !== 'storniert')
  );

  const freeTables = tables.filter(t => t.status === 'frei' && t.id !== parseInt(id!) && !t.merged_into_id);
  const otherBesetzt = tables.filter(t => t.id !== parseInt(id!) && t.status === 'besetzt' && !t.merged_into_id);

  const sessionMins = tableData.session_started_at
    ? minutesSince(tableData.session_started_at, now)
    : null;

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-bold">Tisch {tableData.table_number}</h1>
        <Badge variant={tableData.status === 'frei' ? 'success' : tableData.status === 'rechnung_angefordert' ? 'danger' : 'warning'}>
          {tableData.status === 'frei' ? 'Frei' : tableData.status === 'rechnung_angefordert' ? 'RECHNUNG' : 'Besetzt'}
        </Badge>
      </div>
      {tableData.session_started_at && (
        <div className="flex items-center gap-1 text-xs text-slate-500 mb-3">
          <Clock size={12} />
          <span>Besetzt seit {formatDbTimeHM(tableData.session_started_at)}</span>
          <span>·</span>
          <span>{sessionMins} Min.</span>
        </div>
      )}

      {/* Actions */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <Button onClick={() => navigate(`/bestellen/${id}`)} size="md">
          <span className="flex items-center gap-2"><Plus size={18} /> Bestellen</span>
        </Button>
        <Button variant="warning" onClick={async () => {
          if (!id) return;
          try {
            await billingApi.printBill(parseInt(id));
            toast.success('Rechnung gedruckt');
            loadTable();
          } catch (err: any) {
            toast.error(err?.response?.data?.error || 'Druck fehlgeschlagen');
          }
        }} size="md">
          <span className="flex items-center gap-2"><Bell size={18} /> Rechnung</span>
        </Button>
        <Button variant="success" onClick={() => navigate(`/abrechnung/${id}`)} size="md" disabled={!canSettle}>
          <span className="flex items-center gap-2"><Receipt size={18} /> Abrechnen</span>
        </Button>
        <Button variant="ghost" onClick={() => setShowTransfer(true)} size="md">
          <span className="flex items-center gap-2"><ArrowRightLeft size={18} /> Transfer</span>
        </Button>
        <Button
          variant="ghost"
          onClick={async () => {
            if (!id) return;
            if (!confirm('Tisch freigeben? Der Tisch wird als frei markiert.')) return;
            try {
              await tablesApi.releaseTable(parseInt(id));
              toast.success('Tisch freigegeben');
              navigate('/tische');
            } catch (err: any) {
              toast.error(err?.response?.data?.error || 'Freigabe fehlgeschlagen');
            }
          }}
          size="md"
          className="col-span-2"
        >
          <span className="flex items-center gap-2"><DoorOpen size={18} /> Tisch freigeben</span>
        </Button>
      </div>

      {/* Merged tables info */}
      {tableData.merged_tables?.length > 0 && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm">
          Zusammengelegt mit: {tableData.merged_tables.map((t: Table) => t.table_number).join(', ')}
        </div>
      )}

      {/* Orders */}
      <h2 className="font-semibold mb-2">Bestellungen</h2>
      {tableData.orders?.length === 0 && <p className="text-slate-500 text-sm">Keine Bestellungen</p>}
      {tableData.orders?.map((order: any) => {
        const ob = orderStatusBadge[order.status];
        const hasOpenItems = order.items?.some((i: any) => i.status !== 'serviert' && i.status !== 'storniert');
        const hasWaitableItems = order.items?.some((i: any) => i.status === 'in_zubereitung' || i.status === 'fertig' || i.status === 'serviert');
        return (
        <div key={order.id} className="bg-white rounded-lg border border-slate-200 p-3 mb-2">
          <div className="flex justify-between items-center mb-1">
            <span className="text-sm font-medium">#{order.id} - {order.waiter_name}</span>
            {ob && <Badge variant={ob.variant}>{ob.label}</Badge>}
          </div>
          <div className="text-xs text-slate-500 mb-2">
            {formatDbTimeHM(order.created_at)}
          </div>
          {order.items?.length > 0 ? (
            <>
              <div className="space-y-1.5 border-t border-slate-100 pt-2">
                {order.items.map((item: any) => {
                  const ib = itemStatusBadge[item.status];
                  const isServed = item.status === 'serviert';
                  const canWait = canSetWaiting && (item.status === 'in_zubereitung' || item.status === 'fertig' || item.status === 'serviert');
                  return (
                    <div key={item.id} className={`flex items-center justify-between text-sm gap-2 ${isServed ? 'opacity-60' : ''}`}>
                      <div className="flex-1 min-w-0">
                        <span className="font-medium">{item.quantity}x {item.item_name}</span>
                        {item.notes && <span className="text-xs text-slate-400 ml-1">({item.notes})</span>}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {ib && <Badge variant={ib.variant}>{ib.label}</Badge>}
                        {canWait && (
                          <button
                            onClick={() => handleSetItemStatus(order.id, item.id, 'neu')}
                            className="px-2 py-1 text-xs bg-amber-500 text-white rounded-lg font-medium active:scale-90 hover:bg-amber-600 flex items-center gap-1"
                          >
                            <Clock size={12} /> Warten
                          </button>
                        )}
                        {!isServed && (
                          <button
                            onClick={() => handleSetItemStatus(order.id, item.id, 'serviert')}
                            className="px-2 py-1 text-xs bg-green-600 text-white rounded-lg font-medium active:scale-90 hover:bg-green-700 flex items-center gap-1"
                          >
                            <Truck size={12} /> Geliefert
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {(hasOpenItems || (canSetWaiting && hasWaitableItems)) && (
                <div className="flex gap-2 mt-2 pt-2 border-t border-slate-100">
                  {hasOpenItems && (
                    <Button variant="success" size="sm" className="flex-1" onClick={() => handleSetOrderStatus(order, 'serviert')}>
                      <span className="flex items-center gap-1"><Truck size={14} /> Alle geliefert</span>
                    </Button>
                  )}
                  {canSetWaiting && hasWaitableItems && (
                    <Button variant="warning" size="sm" className="flex-1" onClick={() => handleSetOrderStatus(order, 'neu')}>
                      <span className="flex items-center gap-1"><Clock size={14} /> Alle auf Warten</span>
                    </Button>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="text-xs text-slate-400 border-t border-slate-100 pt-2">Keine Positionen</div>
          )}
        </div>
        );
      })}

      {/* Transfer Modal */}
      <Modal open={showTransfer} onClose={() => setShowTransfer(false)} title="Bestellungen transferieren">
        <p className="text-sm text-slate-500 mb-3">Ziel-Tisch wählen:</p>
        <div className="grid grid-cols-3 gap-2">
          {[...freeTables, ...otherBesetzt].map(t => (
            <button
              key={t.id}
              onClick={() => handleTransfer(t.id)}
              className={`p-3 rounded-lg border-2 text-center font-bold active:scale-95 ${
                t.status === 'frei' ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'
              }`}
            >
              {t.table_number}
            </button>
          ))}
        </div>
      </Modal>

      {/* Merge Modal */}
      <Modal open={showMerge} onClose={() => setShowMerge(false)} title="Tische zusammenlegen">
        <p className="text-sm text-slate-500 mb-3">Tisch zum Zusammenlegen wählen:</p>
        <div className="grid grid-cols-3 gap-2">
          {tables.filter(t => t.id !== parseInt(id!) && !t.merged_into_id && t.is_active).map(t => (
            <button
              key={t.id}
              onClick={() => handleMerge(t.id)}
              className={`p-3 rounded-lg border-2 text-center font-bold active:scale-95 ${
                t.status === 'frei' ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'
              }`}
            >
              {t.table_number}
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}

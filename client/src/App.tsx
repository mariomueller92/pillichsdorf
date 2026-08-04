import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { useAuthStore } from '@/stores/authStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useMenuStore } from '@/stores/menuStore';
import { PrinterErrorWatcher } from '@/components/PrinterErrorWatcher';
import { AuthGuard } from '@/guards/AuthGuard';
import { RoleGuard } from '@/guards/RoleGuard';
import { AppShell } from '@/components/layout/AppShell';
import { LoginPage } from '@/features/auth/LoginPage';
import { TableOverview } from '@/features/waiter/TableOverview';
import { TableDetail } from '@/features/waiter/TableDetail';
import { OrderScreen } from '@/features/waiter/OrderScreen';
import { BillingScreen } from '@/features/waiter/BillingScreen';
import { MyOrders } from '@/features/waiter/MyOrders';
import { BarOverview } from '@/features/waiter/BarOverview';
import { ZentralDashboard } from '@/features/dashboard/ZentralDashboard';
import { SchankSaleScreen } from '@/features/schank/SchankSaleScreen';
import { SchankCheckoutScreen } from '@/features/schank/SchankCheckoutScreen';
import { KassaSpkScreen } from '@/features/kassa/KassaSpkScreen';
import { KassaHistoryScreen } from '@/features/kassa/KassaHistoryScreen';
import { StatsPage } from '@/features/stats/StatsPage';
import { UserManagement } from '@/features/admin/UserManagement';
import { MenuManagement } from '@/features/admin/MenuManagement';
import { JetonTypeManagement } from '@/features/admin/JetonTypeManagement';
import { SettingsManagement } from '@/features/admin/SettingsManagement';
import { TableManagement } from '@/features/admin/TableManagement';
import { AdminLayout } from '@/features/admin/AdminLayout';
import { AdminOrders } from '@/features/admin/AdminOrders';

export default function App() {
  const restore = useAuthStore(s => s.restore);
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const loadSettings = useSettingsStore(s => s.load);
  const fetchMenu = useMenuStore(s => s.fetchMenu);

  useEffect(() => {
    restore();
    loadSettings();
  }, []);

  // Ersetzt den frueheren "product:availability_changed"-Socket-Push: Menue-Aenderungen
  // durch einen Admin/Schank-Chef erreichen andere Screens jetzt per Polling.
  useEffect(() => {
    if (!isAuthenticated) return;
    const interval = setInterval(fetchMenu, 20000);
    return () => clearInterval(interval);
  }, [isAuthenticated, fetchMenu]);

  return (
    <BrowserRouter>
      {isAuthenticated && <PrinterErrorWatcher />}
      <Toaster position="top-center" richColors closeButton />
      <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route element={<AuthGuard />}>
            <Route element={<AppShell />}>
              {/* Kellner + Admin routes */}
              <Route element={<RoleGuard allowed={['kellner', 'admin']} />}>
                <Route path="/" element={<Navigate to="/tische" replace />} />
                <Route path="/tische" element={<TableOverview />} />
                <Route path="/tisch/:id" element={<TableDetail />} />
                <Route path="/bar" element={<BarOverview />} />
                <Route path="/bestellen/bar" element={<OrderScreen />} />
                <Route path="/bestellen/:tischId" element={<OrderScreen />} />
                <Route path="/abrechnung/:tischId" element={<BillingScreen />} />
                <Route path="/meine-bestellungen" element={<MyOrders />} />
              </Route>

              {/* Zentral-Dashboard (Schank-Chef am Laptop) */}
              <Route element={<RoleGuard allowed={['kueche_schank', 'admin']} />}>
                <Route path="/zentral" element={<ZentralDashboard />} />
                <Route path="/statistik" element={<StatsPage />} />
              </Route>

              {/* Schank-Kellner (Verkauf direkt an der Schank) */}
              <Route element={<RoleGuard allowed={['schank_kellner', 'admin']} />}>
                <Route path="/schank/verkauf" element={<SchankSaleScreen />} />
                <Route path="/schank/kassieren/:orderId" element={<SchankCheckoutScreen />} />
              </Route>

              {/* Kassa-SPK (Zentralkasse mit Jeton-Ausgabe) */}
              <Route element={<RoleGuard allowed={['kassa_spk', 'admin']} />}>
                <Route path="/kassa" element={<KassaSpkScreen />} />
                <Route path="/kassa/historie" element={<KassaHistoryScreen />} />
              </Route>

              {/* Admin routes */}
              <Route element={<RoleGuard allowed={['admin']} />}>
                <Route path="/admin" element={<AdminLayout />}>
                  <Route index element={<Navigate to="/admin/speisekarte" replace />} />
                  <Route path="benutzer" element={<UserManagement />} />
                  <Route path="speisekarte" element={<MenuManagement />} />
                  <Route path="jeton-typen" element={<JetonTypeManagement />} />
                  <Route path="tische" element={<TableManagement />} />
                  <Route path="bestellungen" element={<AdminOrders />} />
                  <Route path="einstellungen" element={<SettingsManagement />} />
                </Route>
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    </BrowserRouter>
  );
}

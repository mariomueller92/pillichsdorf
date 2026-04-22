import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { useAuthStore } from '@/stores/authStore';
import { SocketProvider } from '@/socket/SocketProvider';
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
import { StatsPage } from '@/features/stats/StatsPage';
import { UserManagement } from '@/features/admin/UserManagement';
import { MenuManagement } from '@/features/admin/MenuManagement';
import { TableManagement } from '@/features/admin/TableManagement';
import { AdminLayout } from '@/features/admin/AdminLayout';
import { AdminOrders } from '@/features/admin/AdminOrders';

export default function App() {
  const restore = useAuthStore(s => s.restore);

  useEffect(() => {
    restore();
  }, []);

  return (
    <BrowserRouter>
      <SocketProvider>
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

              {/* Admin routes */}
              <Route element={<RoleGuard allowed={['admin']} />}>
                <Route path="/admin" element={<AdminLayout />}>
                  <Route index element={<Navigate to="/admin/speisekarte" replace />} />
                  <Route path="benutzer" element={<UserManagement />} />
                  <Route path="speisekarte" element={<MenuManagement />} />
                  <Route path="tische" element={<TableManagement />} />
                  <Route path="bestellungen" element={<AdminOrders />} />
                </Route>
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </SocketProvider>
    </BrowserRouter>
  );
}

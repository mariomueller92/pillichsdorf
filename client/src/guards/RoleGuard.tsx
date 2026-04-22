import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { Role } from '@/types';

export function RoleGuard({ allowed }: { allowed: Role[] }) {
  const user = useAuthStore(s => s.user);

  if (!user || !allowed.includes(user.role)) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

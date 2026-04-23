import { NavLink } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { LayoutGrid, Monitor, Beer, ClipboardList, Settings, BarChart3 } from 'lucide-react';

export function BottomNav() {
  const user = useAuthStore(s => s.user);
  if (!user) return null;

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex flex-col items-center gap-0.5 px-3 py-1.5 text-xs rounded-lg transition-colors min-w-[3.5rem] ${
      isActive ? 'text-primary font-semibold' : 'text-slate-500 hover:text-slate-700'
    }`;

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-40">
      <div className="flex justify-around px-1 py-1 max-w-lg mx-auto">
        {/* Kellner sieht: Tische, Bar */}
        {(user.role === 'kellner' || user.role === 'admin') && (
          <>
            <NavLink to="/tische" className={linkClass}>
              <LayoutGrid size={20} />
              <span>Tische</span>
            </NavLink>
            <NavLink to="/meine-bestellungen" className={linkClass}>
              <ClipboardList size={20} />
              <span>Bestellungen</span>
            </NavLink>
            <NavLink to="/bar" className={linkClass}>
              <Beer size={20} />
              <span>Bar</span>
            </NavLink>
          </>
        )}
        {/* Schank-Chef sieht: Zentral-Dashboard + Statistik */}
        {(user.role === 'kueche_schank' || user.role === 'admin') && (
          <>
            <NavLink to="/zentral" className={linkClass}>
              <Monitor size={20} />
              <span>Zentral</span>
            </NavLink>
            <NavLink to="/statistik" className={linkClass}>
              <BarChart3 size={20} />
              <span>Statistik</span>
            </NavLink>
          </>
        )}
        {/* Admin sieht zusätzlich: Verwaltung (Sammelseite) */}
        {user.role === 'admin' && (
          <NavLink to="/admin/speisekarte" className={linkClass}>
            <Settings size={20} />
            <span>Verw.</span>
          </NavLink>
        )}
      </div>
    </nav>
  );
}

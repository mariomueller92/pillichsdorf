import { NavLink, Outlet } from 'react-router-dom';

export function AdminLayout() {
  const tabClass = ({ isActive }: { isActive: boolean }) =>
    `px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
      isActive ? 'bg-white text-primary border-b-2 border-primary' : 'text-slate-500 hover:text-slate-700'
    }`;

  return (
    <div>
      <div className="bg-slate-200 overflow-x-auto">
        <div className="flex gap-1 px-4 pt-2">
          <NavLink to="/admin/speisekarte" className={tabClass}>Speisekarte</NavLink>
          <NavLink to="/admin/tische" className={tabClass}>Tische</NavLink>
          <NavLink to="/admin/benutzer" className={tabClass}>Benutzer</NavLink>
          <NavLink to="/admin/bestellungen" className={tabClass}>Bestellungen</NavLink>
        </div>
      </div>
      <Outlet />
    </div>
  );
}

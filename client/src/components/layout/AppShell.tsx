import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { BottomNav } from './BottomNav';
import { useAuthStore } from '@/stores/authStore';
import { LogOut, Volume2, VolumeX, Sun, Moon, WifiOff } from 'lucide-react';
import { useUIStore } from '@/stores/uiStore';

export function AppShell() {
  const user = useAuthStore(s => s.user);
  const logout = useAuthStore(s => s.logout);
  const soundEnabled = useUIStore(s => s.soundEnabled);
  const toggleSound = useUIStore(s => s.toggleSound);
  const highContrast = useUIStore(s => s.highContrast);
  const toggleHighContrast = useUIStore(s => s.toggleHighContrast);
  const isOffline = useUIStore(s => s.isOffline);

  // Apply HC class on mount if already set
  useEffect(() => {
    document.documentElement.classList.toggle('high-contrast', highContrast);
  }, []);

  return (
    <div className="flex flex-col h-dvh bg-slate-100">
      {/* Offline banner */}
      {isOffline && (
        <div className="bg-red-600 text-white text-center py-1.5 text-sm font-medium flex items-center justify-center gap-2 shrink-0">
          <WifiOff size={16} />
          Keine Verbindung - Bestellungen werden gespeichert
        </div>
      )}

      {/* Top bar */}
      <header className="bg-slate-800 text-white px-4 py-2 flex items-center justify-between shrink-0">
        <div className="font-semibold text-sm">
          Rainer Wein
        </div>
        <div className="flex items-center gap-2">
          <button onClick={toggleHighContrast} className="p-1.5 rounded hover:bg-slate-700 active:scale-90" title="Kontrast">
            {highContrast ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button onClick={toggleSound} className="p-1.5 rounded hover:bg-slate-700 active:scale-90" title="Ton">
            {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>
          <span className="text-sm text-slate-300">{user?.display_name}</span>
          <button onClick={logout} className="p-1.5 rounded hover:bg-slate-700 active:scale-90" title="Abmelden">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto pb-14">
        <Outlet />
      </main>

      {/* Bottom nav */}
      <BottomNav />
    </div>
  );
}

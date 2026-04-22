import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { PinPad } from '@/components/PinPad';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

export function LoginPage() {
  const [mode, setMode] = useState<'pin' | 'admin'>('pin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { loginWithPin, loginWithCredentials } = useAuthStore();

  const redirectByRole = (role: string) => {
    switch (role) {
      case 'admin': navigate('/tische', { replace: true }); break;
      case 'kellner': navigate('/tische', { replace: true }); break;
      case 'kueche_schank': navigate('/zentral', { replace: true }); break;
      default: navigate('/tische', { replace: true });
    }
  };

  const handlePinSubmit = async (pin: string) => {
    setError('');
    setLoading(true);
    try {
      await loginWithPin(pin);
      const user = useAuthStore.getState().user;
      if (user) redirectByRole(user.role);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Anmeldung fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  };

  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await loginWithCredentials(username, password);
      const user = useAuthStore.getState().user;
      if (user) redirectByRole(user.role);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Anmeldung fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh bg-slate-800 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-white text-center mb-2">Rainer Wein</h1>
        <p className="text-slate-400 text-center mb-8">Anmeldung</p>

        {/* Mode toggle */}
        <div className="flex bg-slate-700 rounded-lg p-1 mb-6">
          <button
            className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
              mode === 'pin' ? 'bg-white text-slate-800' : 'text-slate-300'
            }`}
            onClick={() => { setMode('pin'); setError(''); }}
          >
            PIN
          </button>
          <button
            className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
              mode === 'admin' ? 'bg-white text-slate-800' : 'text-slate-300'
            }`}
            onClick={() => { setMode('admin'); setError(''); }}
          >
            Admin-Login
          </button>
        </div>

        {mode === 'pin' ? (
          <div className="bg-slate-700/50 rounded-2xl p-6">
            <p className="text-white text-center mb-6 text-sm">PIN eingeben</p>
            <PinPad onSubmit={handlePinSubmit} loading={loading} error={error} />
          </div>
        ) : (
          <form onSubmit={handleAdminSubmit} className="bg-slate-700/50 rounded-2xl p-6 flex flex-col gap-4">
            <Input
              label="Benutzername"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoComplete="username"
              className="bg-white"
            />
            <Input
              label="Passwort"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
              className="bg-white"
            />
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <Button type="submit" disabled={loading} size="lg" className="w-full">
              {loading ? 'Anmelden...' : 'Anmelden'}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}

import { create } from 'zustand';
import { User, Role } from '@/types';
import * as authApi from '@/api/auth.api';

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  loginWithPin: (pin: string) => Promise<void>;
  loginWithCredentials: (username: string, password: string) => Promise<void>;
  logout: () => void;
  restore: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: localStorage.getItem('token'),
  isAuthenticated: !!localStorage.getItem('token'),

  loginWithPin: async (pin: string) => {
    const result = await authApi.loginWithPin(pin);
    localStorage.setItem('token', result.token);
    localStorage.setItem('user', JSON.stringify(result.user));
    set({ user: result.user, token: result.token, isAuthenticated: true });
  },

  loginWithCredentials: async (username: string, password: string) => {
    const result = await authApi.loginWithCredentials(username, password);
    localStorage.setItem('token', result.token);
    localStorage.setItem('user', JSON.stringify(result.user));
    set({ user: result.user, token: result.token, isAuthenticated: true });
  },

  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    set({ user: null, token: null, isAuthenticated: false });
  },

  restore: async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      const user = await authApi.getMe();
      set({ user, token, isAuthenticated: true });
    } catch {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      set({ user: null, token: null, isAuthenticated: false });
    }
  },
}));

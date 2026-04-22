import { create } from 'zustand';

interface UIState {
  soundEnabled: boolean;
  highContrast: boolean;
  isOffline: boolean;
  toggleSound: () => void;
  toggleHighContrast: () => void;
  setOffline: (offline: boolean) => void;
}

export const useUIStore = create<UIState>((set, get) => ({
  soundEnabled: localStorage.getItem('soundEnabled') !== 'false',
  highContrast: localStorage.getItem('highContrast') === 'true',
  isOffline: false,

  toggleSound: () => {
    const newVal = !get().soundEnabled;
    localStorage.setItem('soundEnabled', String(newVal));
    set({ soundEnabled: newVal });
  },

  toggleHighContrast: () => {
    const newVal = !get().highContrast;
    localStorage.setItem('highContrast', String(newVal));
    set({ highContrast: newVal });
    // Toggle class on document root
    document.documentElement.classList.toggle('high-contrast', newVal);
  },

  setOffline: (offline: boolean) => set({ isOffline: offline }),
}));

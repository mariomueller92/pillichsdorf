import { create } from 'zustand';
import * as settingsApi from '@/api/settings.api';

interface SettingsState {
  companyName: string;
  loaded: boolean;
  load: () => Promise<void>;
}

const FALLBACK_NAME = 'Gastro-App';

export const useSettingsStore = create<SettingsState>((set) => ({
  companyName: FALLBACK_NAME,
  loaded: false,

  load: async () => {
    try {
      const settings = await settingsApi.getSettings();
      document.title = settings.company_name;
      set({ companyName: settings.company_name, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },
}));

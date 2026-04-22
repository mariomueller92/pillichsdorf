import { create } from 'zustand';
import { Table } from '@/types';
import * as tablesApi from '@/api/tables.api';

interface TablesState {
  tables: Table[];
  fetchTables: () => Promise<void>;
  updateTableLocal: (id: number, patch: Partial<Table>) => void;
}

export const useTablesStore = create<TablesState>((set, get) => ({
  tables: [],

  fetchTables: async () => {
    const tables = await tablesApi.getTables();
    set({ tables });
  },

  updateTableLocal: (id: number, patch: Partial<Table>) => {
    set({
      tables: get().tables.map(t => t.id === id ? { ...t, ...patch } : t),
    });
  },
}));

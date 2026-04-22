import { create } from 'zustand';
import { MenuCategory, MenuItem } from '@/types';
import * as menuApi from '@/api/menu.api';

interface MenuState {
  categories: MenuCategory[];
  items: MenuItem[];
  isLoaded: boolean;
  fetchMenu: () => Promise<void>;
  getItemsByCategory: (categoryId: number) => MenuItem[];
}

export const useMenuStore = create<MenuState>((set, get) => ({
  categories: [],
  items: [],
  isLoaded: false,

  fetchMenu: async () => {
    const [categories, items] = await Promise.all([
      menuApi.getCategories(),
      menuApi.getItems(),
    ]);
    set({ categories, items, isLoaded: true });
  },

  getItemsByCategory: (categoryId: number) => {
    return get().items.filter(i => i.category_id === categoryId && i.is_available);
  },
}));

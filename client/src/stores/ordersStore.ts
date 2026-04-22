import { create } from 'zustand';
import { CartItem, Order, MenuItem, CategoryTarget, AvailabilityMode } from '@/types';
import * as ordersApi from '@/api/orders.api';

interface OrdersState {
  activeOrders: Order[];
  cart: CartItem[];

  // Cart actions
  addToCart: (item: MenuItem, categoryTarget: CategoryTarget) => void;
  removeFromCart: (menuItemId: number) => void;
  updateCartQuantity: (menuItemId: number, quantity: number) => void;
  updateCartItemNotes: (menuItemId: number, notes: string) => void;
  clearCart: () => void;
  getCartTotal: () => number;

  // Order actions
  submitOrder: (tableId: number | null, notes?: string) => Promise<Order>;
  fetchActiveOrders: (target?: 'kueche' | 'schank') => Promise<void>;
  addIncomingOrder: (order: Order) => void;
  updateOrderInList: (order: Order) => void;
  removeOrderFromList: (orderId: number) => void;
}

export const useOrdersStore = create<OrdersState>((set, get) => ({
  activeOrders: [],
  cart: [],

  addToCart: (item: MenuItem, categoryTarget: CategoryTarget) => {
    const cart = get().cart;
    const existing = cart.find(c => c.menu_item_id === item.id);
    if (existing) {
      set({
        cart: cart.map(c =>
          c.menu_item_id === item.id ? { ...c, quantity: c.quantity + 1 } : c
        ),
      });
    } else {
      set({
        cart: [...cart, {
          menu_item_id: item.id,
          name: item.name,
          price: item.price,
          quantity: 1,
          notes: '',
          category_target: categoryTarget,
          availability_mode: item.availability_mode || 'sofort',
        }],
      });
    }
  },

  removeFromCart: (menuItemId: number) => {
    set({ cart: get().cart.filter(c => c.menu_item_id !== menuItemId) });
  },

  updateCartQuantity: (menuItemId: number, quantity: number) => {
    if (quantity <= 0) {
      get().removeFromCart(menuItemId);
      return;
    }
    set({
      cart: get().cart.map(c =>
        c.menu_item_id === menuItemId ? { ...c, quantity } : c
      ),
    });
  },

  updateCartItemNotes: (menuItemId: number, notes: string) => {
    set({
      cart: get().cart.map(c =>
        c.menu_item_id === menuItemId ? { ...c, notes } : c
      ),
    });
  },

  clearCart: () => set({ cart: [] }),

  getCartTotal: () => {
    return get().cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  },

  submitOrder: async (tableId: number | null, notes?: string) => {
    const cart = get().cart;
    const order = await ordersApi.createOrder({
      table_id: tableId,
      notes: notes || null,
      items: cart.map(c => ({
        menu_item_id: c.menu_item_id,
        quantity: c.quantity,
        notes: c.notes || null,
      })),
    });
    set({ cart: [] });
    return order;
  },

  fetchActiveOrders: async (target?: 'kueche' | 'schank') => {
    const orders = await ordersApi.getActiveOrders(target);
    set({ activeOrders: orders });
  },

  addIncomingOrder: (order: Order) => {
    set(state => {
      const exists = state.activeOrders.some(o => o.id === order.id);
      if (exists) {
        return { activeOrders: state.activeOrders.map(o => o.id === order.id ? order : o) };
      }
      return { activeOrders: [...state.activeOrders, order] };
    });
  },

  updateOrderInList: (order: Order) => {
    set(state => ({
      activeOrders: state.activeOrders.map(o => o.id === order.id ? order : o),
    }));
  },

  removeOrderFromList: (orderId: number) => {
    set(state => ({
      activeOrders: state.activeOrders.filter(o => o.id !== orderId),
    }));
  },
}));

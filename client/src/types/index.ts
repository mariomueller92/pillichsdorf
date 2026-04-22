export type Role = 'admin' | 'kellner' | 'kueche_schank';
export type TableStatus = 'frei' | 'besetzt' | 'rechnung_angefordert';
export type OrderStatus = 'offen' | 'in_bearbeitung' | 'fertig' | 'serviert' | 'storniert';
export type OrderItemStatus = 'neu' | 'in_zubereitung' | 'fertig' | 'serviert' | 'storniert';
export type CategoryTarget = 'kueche' | 'schank';
export type DiscountType = 'percentage' | 'fixed';
export type AvailabilityMode = 'sofort' | 'lieferzeit';

export interface User {
  id: number;
  username: string | null;
  display_name: string;
  role: Role;
  is_active: number;
}

export interface MenuCategory {
  id: number;
  name: string;
  sort_order: number;
  target: CategoryTarget;
  is_active: number;
}

export interface MenuItem {
  id: number;
  category_id: number;
  name: string;
  price: number;
  sort_order: number;
  is_available: number;
  availability_mode: AvailabilityMode;
  is_active: number;
}

export interface Table {
  id: number;
  table_number: string;
  capacity: number | null;
  sort_order: number;
  status: TableStatus;
  merged_into_id: number | null;
  is_active: number;
  has_pending_items?: number;
  oldest_pending_at?: string | null;
  session_started_at?: string | null;
}

export interface Order {
  id: number;
  table_id: number | null;
  bar_slot: string | null;
  waiter_id: number;
  waiter_name: string;
  table_number: string | null;
  status: OrderStatus;
  notes: string | null;
  items: OrderItemWithDetails[];
  created_at: string;
}

export interface OrderItemWithDetails {
  id: number;
  order_id: number;
  menu_item_id: number;
  quantity: number;
  unit_price: number;
  notes: string | null;
  status: OrderItemStatus;
  item_name: string;
  category_target: CategoryTarget;
  category_name: string;
  availability_mode: AvailabilityMode;
  acknowledged_by: number | null;
  acknowledged_at: string | null;
}

export interface Bill {
  id: number;
  table_id: number | null;
  waiter_id: number;
  subtotal: number;
  discount_type: DiscountType | null;
  discount_value: number;
  total: number;
  notes: string | null;
  created_at: string;
}

export interface CartItem {
  menu_item_id: number;
  name: string;
  price: number;
  quantity: number;
  notes: string;
  category_target: CategoryTarget;
  availability_mode: AvailabilityMode;
}

export interface AuthResponse {
  token: string;
  user: User;
}

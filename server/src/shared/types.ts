export type Role = 'admin' | 'kellner' | 'kueche_schank';

export type TableStatus = 'frei' | 'besetzt';

export type AvailabilityMode = 'sofort' | 'lieferzeit';

export type OrderStatus = 'offen' | 'in_bearbeitung' | 'fertig' | 'serviert' | 'storniert';

export type OrderItemStatus = 'neu' | 'in_zubereitung' | 'fertig' | 'serviert' | 'storniert';

export type CategoryTarget = 'kueche' | 'schank';

export type DiscountType = 'percentage' | 'fixed';

export interface User {
  id: number;
  username: string | null;
  password_hash: string | null;
  pin_hash: string | null;
  display_name: string;
  role: Role;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface UserPublic {
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
  created_at: string;
  updated_at: string;
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
  created_at: string;
  updated_at: string;
}

export interface Table {
  id: number;
  table_number: string;
  capacity: number | null;
  sort_order: number;
  status: TableStatus;
  merged_into_id: number | null;
  is_active: number;
  created_at: string;
  updated_at: string;
  has_pending_items?: number;
  oldest_pending_at?: string | null;
  session_started_at?: string | null;
}

export interface Order {
  id: number;
  table_id: number | null;
  bar_slot: string | null;
  waiter_id: number;
  status: OrderStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  id: number;
  order_id: number;
  menu_item_id: number;
  quantity: number;
  unit_price: number;
  notes: string | null;
  status: OrderItemStatus;
  acknowledged_by: number | null;
  acknowledged_at: string | null;
  created_at: string;
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

export interface BillItem {
  id: number;
  bill_id: number;
  order_item_id: number;
  quantity: number;
  unit_price: number;
}

export interface JwtPayload {
  userId: number;
  role: Role;
  displayName: string;
}

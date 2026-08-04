export type Role = 'admin' | 'kellner' | 'kueche_schank' | 'schank_kellner' | 'kassa_spk';
export type TableStatus = 'frei' | 'besetzt';
export type OrderStatus = 'offen' | 'in_bearbeitung' | 'fertig' | 'serviert' | 'storniert';
export type OrderItemStatus = 'neu' | 'in_zubereitung' | 'fertig' | 'serviert' | 'storniert';
export type CategoryTarget = 'kueche' | 'schank';
export type DiscountType = 'percentage' | 'fixed';
export type AvailabilityMode = 'sofort' | 'lieferzeit';
export type PaymentMode = 'bargeld' | 'jeton';

export interface User {
  id: number;
  username: string | null;
  display_name: string;
  role: Role;
  payment_mode: PaymentMode;
  is_active: boolean;
}

export interface JetonType {
  id: number;
  name: string;
  color: string;
  value: number;
  sort_order: number;
  is_active: boolean;
}

export interface JetonBreakdownEntry {
  jeton_type_id: number;
  name: string;
  color: string;
  value: number;
  count: number;
  subtotal_eur: number;
}

export interface MenuCategory {
  id: number;
  name: string;
  sort_order: number;
  target: CategoryTarget;
  is_active: boolean;
}

export interface MenuItem {
  id: number;
  category_id: number;
  name: string;
  price: number;
  sort_order: number;
  is_available: boolean;
  availability_mode: AvailabilityMode;
  jeton_type_id: number | null;
  is_active: boolean;
}

export interface Table {
  id: number;
  table_number: string;
  capacity: number | null;
  sort_order: number;
  status: TableStatus;
  merged_into_id: number | null;
  is_active: boolean;
  has_pending_items?: number;
  has_undelivered_items?: number;
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
  jeton_type_id: number | null;
  jeton_name: string | null;
  jeton_color: string | null;
  jeton_value: number | null;
}

export interface Bill {
  id: number;
  table_id: number | null;
  waiter_id: number;
  subtotal: number;
  discount_type: DiscountType | null;
  discount_value: number;
  total: number;
  payment_mode: PaymentMode;
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
  jeton_type_id: number | null;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface Settings {
  id: 1;
  company_name: string;
  company_address1: string;
  company_address2: string;
  company_betriebsnummer: string;
  company_footer: string;
  printer_name: string;
  printer_width: number;
  updated_at: string;
}

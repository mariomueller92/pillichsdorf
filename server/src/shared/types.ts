export type Role = 'admin' | 'kellner' | 'kueche_schank' | 'schank_kellner' | 'kassa_spk';

export type TableStatus = 'frei' | 'besetzt';

export type AvailabilityMode = 'sofort' | 'lieferzeit';

export type OrderStatus = 'offen' | 'in_bearbeitung' | 'fertig' | 'serviert' | 'storniert';

export type OrderItemStatus = 'neu' | 'in_zubereitung' | 'fertig' | 'serviert' | 'storniert';

export type CategoryTarget = 'kueche' | 'schank';

export type DiscountType = 'percentage' | 'fixed';

export type PaymentMode = 'bargeld' | 'jeton';

export interface User {
  id: number;
  username: string | null;
  password_hash: string | null;
  pin_hash: string | null;
  display_name: string;
  role: Role;
  payment_mode: PaymentMode;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserPublic {
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
  created_at: string;
  updated_at: string;
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
  created_at: string;
  updated_at: string;
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
  is_active: boolean;
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
  payment_mode: PaymentMode;
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

export interface JwtPayload {
  userId: number;
  role: Role;
  displayName: string;
}

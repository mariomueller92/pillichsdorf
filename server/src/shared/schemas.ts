import { z } from 'zod';
import { ROLES, CATEGORY_TARGETS, DISCOUNT_TYPES, AVAILABILITY_MODES, PAYMENT_MODES } from './constants.js';

const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Ungültige Hex-Farbe (z.B. #E53935)');

// PIN-Login: 4 Ziffern (Standard) oder 8 Ziffern (z.B. Kassa-SPK)
const pinSchema = z.string().regex(/^(\d{4}|\d{8})$/, 'PIN muss 4 oder 8 Ziffern haben');

// Auth
export const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export const pinLoginSchema = z.object({
  pin: pinSchema,
});

// Users
export const createUserSchema = z.object({
  username: z.string().min(1).nullable().optional(),
  password: z.string().min(4).nullable().optional(),
  pin: pinSchema.nullable().optional(),
  display_name: z.string().min(1),
  role: z.enum(ROLES),
  payment_mode: z.enum(PAYMENT_MODES).optional(),
});

export const updateUserSchema = z.object({
  username: z.string().min(1).nullable().optional(),
  password: z.string().min(4).nullable().optional(),
  pin: pinSchema.nullable().optional(),
  display_name: z.string().min(1).optional(),
  role: z.enum(ROLES).optional(),
  payment_mode: z.enum(PAYMENT_MODES).optional(),
  is_active: z.number().min(0).max(1).optional(),
});

// Menu Categories
export const createCategorySchema = z.object({
  name: z.string().min(1),
  sort_order: z.number().int().default(0),
  target: z.enum(CATEGORY_TARGETS),
});

export const updateCategorySchema = z.object({
  name: z.string().min(1).optional(),
  sort_order: z.number().int().optional(),
  target: z.enum(CATEGORY_TARGETS).optional(),
  is_active: z.number().min(0).max(1).optional(),
});

// Menu Items
export const createMenuItemSchema = z.object({
  category_id: z.number().int().positive(),
  name: z.string().min(1),
  price: z.number().min(0),
  sort_order: z.number().int().default(0),
  jeton_type_id: z.number().int().positive().nullable().optional(),
});

export const updateMenuItemSchema = z.object({
  category_id: z.number().int().positive().optional(),
  name: z.string().min(1).optional(),
  price: z.number().min(0).optional(),
  sort_order: z.number().int().optional(),
  is_available: z.number().min(0).max(1).optional(),
  availability_mode: z.enum(AVAILABILITY_MODES).optional(),
  jeton_type_id: z.number().int().positive().nullable().optional(),
  is_active: z.number().min(0).max(1).optional(),
});

export const toggleAvailabilityModeSchema = z.object({
  mode: z.enum(AVAILABILITY_MODES),
});

// Jeton Types
export const createJetonTypeSchema = z.object({
  name: z.string().min(1),
  color: hexColor,
  value: z.number().min(0),
  sort_order: z.number().int().default(0),
});

export const updateJetonTypeSchema = z.object({
  name: z.string().min(1).optional(),
  color: hexColor.optional(),
  value: z.number().min(0).optional(),
  sort_order: z.number().int().optional(),
  is_active: z.number().min(0).max(1).optional(),
});

// Tables
export const createTableSchema = z.object({
  table_number: z.string().min(1),
  capacity: z.number().int().positive().nullable().optional(),
  sort_order: z.number().int().optional(),
});

export const updateTableSchema = z.object({
  table_number: z.string().min(1).optional(),
  capacity: z.number().int().positive().nullable().optional(),
  sort_order: z.number().int().optional(),
  status: z.enum(['frei', 'besetzt']).optional(),
  is_active: z.number().min(0).max(1).optional(),
});

// Orders
export const createOrderSchema = z.object({
  table_id: z.number().int().positive().nullable(),
  notes: z.string().nullable().optional(),
  items: z.array(z.object({
    menu_item_id: z.number().int().positive(),
    quantity: z.number().int().positive(),
    notes: z.string().nullable().optional(),
  })).min(1),
});

export const addOrderItemsSchema = z.object({
  items: z.array(z.object({
    menu_item_id: z.number().int().positive(),
    quantity: z.number().int().positive(),
    notes: z.string().nullable().optional(),
  })).min(1),
});

export const acknowledgeSchema = z.object({
  item_ids: z.array(z.number().int().positive()).min(1),
  status: z.enum(['in_zubereitung', 'fertig']),
});

export const transferOrderSchema = z.object({
  target_table_id: z.number().int().positive(),
});

// Tables merge
export const mergeTablesSchema = z.object({
  primary_table_id: z.number().int().positive(),
  secondary_table_ids: z.array(z.number().int().positive()).min(1),
});

export const unmergeTableSchema = z.object({
  table_id: z.number().int().positive(),
});

// Billing
export const settleTableSchema = z.object({
  discount_type: z.enum(DISCOUNT_TYPES).nullable().optional(),
  discount_value: z.number().min(0).default(0),
  notes: z.string().nullable().optional(),
  print_bon: z.boolean().default(false),
});

// Settings
export const updateSettingsSchema = z.object({
  company_name: z.string().min(1).optional(),
  company_address1: z.string().optional(),
  company_address2: z.string().optional(),
  company_betriebsnummer: z.string().optional(),
  company_footer: z.string().optional(),
  printer_name: z.string().min(1).optional(),
  printer_width: z.number().int().positive().optional(),
});

export const settleItemsSchema = z.object({
  table_id: z.number().int().positive(),
  items: z.array(z.object({
    order_item_id: z.number().int().positive(),
    quantity: z.number().int().positive(),
  })).min(1),
  discount_type: z.enum(DISCOUNT_TYPES).nullable().optional(),
  discount_value: z.number().min(0).default(0),
  notes: z.string().nullable().optional(),
  print_bon: z.boolean().default(false),
});

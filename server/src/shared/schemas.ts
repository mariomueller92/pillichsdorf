import { z } from 'zod';
import { ROLES, CATEGORY_TARGETS, DISCOUNT_TYPES, AVAILABILITY_MODES } from './constants.js';

// Auth
export const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export const pinLoginSchema = z.object({
  pin: z.string().length(4).regex(/^\d{4}$/),
});

// Users
export const createUserSchema = z.object({
  username: z.string().min(1).nullable().optional(),
  password: z.string().min(4).nullable().optional(),
  pin: z.string().length(4).regex(/^\d{4}$/).nullable().optional(),
  display_name: z.string().min(1),
  role: z.enum(ROLES),
});

export const updateUserSchema = z.object({
  username: z.string().min(1).nullable().optional(),
  password: z.string().min(4).nullable().optional(),
  pin: z.string().length(4).regex(/^\d{4}$/).nullable().optional(),
  display_name: z.string().min(1).optional(),
  role: z.enum(ROLES).optional(),
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
});

export const updateMenuItemSchema = z.object({
  category_id: z.number().int().positive().optional(),
  name: z.string().min(1).optional(),
  price: z.number().min(0).optional(),
  sort_order: z.number().int().optional(),
  is_available: z.number().min(0).max(1).optional(),
  availability_mode: z.enum(AVAILABILITY_MODES).optional(),
  is_active: z.number().min(0).max(1).optional(),
});

export const toggleAvailabilityModeSchema = z.object({
  mode: z.enum(AVAILABILITY_MODES),
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

import { getDb } from '../database.js';
import { MenuCategory, MenuItem } from '../shared/types.js';
import { AppError } from '../middleware/errorHandler.js';

// Categories
export function listCategories(): MenuCategory[] {
  return getDb().prepare(
    'SELECT * FROM menu_categories WHERE is_active = 1 ORDER BY sort_order, name'
  ).all() as MenuCategory[];
}

export function getCategory(id: number): MenuCategory {
  const cat = getDb().prepare('SELECT * FROM menu_categories WHERE id = ?').get(id) as MenuCategory | undefined;
  if (!cat) throw new AppError(404, 'Kategorie nicht gefunden');
  return cat;
}

export function createCategory(data: { name: string; sort_order: number; target: string }): MenuCategory {
  const result = getDb().prepare(
    'INSERT INTO menu_categories (name, sort_order, target) VALUES (?, ?, ?)'
  ).run(data.name, data.sort_order, data.target);
  return getCategory(result.lastInsertRowid as number);
}

export function updateCategory(id: number, data: Partial<MenuCategory>): MenuCategory {
  const existing = getCategory(id);
  const updates: string[] = [];
  const values: any[] = [];

  if (data.name !== undefined) { updates.push('name = ?'); values.push(data.name); }
  if (data.sort_order !== undefined) { updates.push('sort_order = ?'); values.push(data.sort_order); }
  if (data.target !== undefined) { updates.push('target = ?'); values.push(data.target); }
  if (data.is_active !== undefined) { updates.push('is_active = ?'); values.push(data.is_active); }

  if (updates.length > 0) {
    updates.push("updated_at = datetime('now')");
    values.push(id);
    getDb().prepare(`UPDATE menu_categories SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }
  return getCategory(id);
}

export function deleteCategory(id: number): void {
  const result = getDb().prepare("UPDATE menu_categories SET is_active = 0, updated_at = datetime('now') WHERE id = ?").run(id);
  if (result.changes === 0) throw new AppError(404, 'Kategorie nicht gefunden');
}

// Items
export function listItems(categoryId?: number): MenuItem[] {
  if (categoryId) {
    return getDb().prepare(
      'SELECT * FROM menu_items WHERE category_id = ? AND is_active = 1 ORDER BY sort_order, name'
    ).all(categoryId) as MenuItem[];
  }
  return getDb().prepare(
    'SELECT * FROM menu_items WHERE is_active = 1 ORDER BY sort_order, name'
  ).all() as MenuItem[];
}

export function getItem(id: number): MenuItem {
  const item = getDb().prepare('SELECT * FROM menu_items WHERE id = ?').get(id) as MenuItem | undefined;
  if (!item) throw new AppError(404, 'Artikel nicht gefunden');
  return item;
}

export function createItem(data: { category_id: number; name: string; price: number; sort_order: number }): MenuItem {
  getCategory(data.category_id); // verify category exists
  const result = getDb().prepare(
    'INSERT INTO menu_items (category_id, name, price, sort_order) VALUES (?, ?, ?, ?)'
  ).run(data.category_id, data.name, data.price, data.sort_order);
  return getItem(result.lastInsertRowid as number);
}

export function updateItem(id: number, data: Partial<MenuItem>): MenuItem {
  getItem(id); // verify exists
  const updates: string[] = [];
  const values: any[] = [];

  if (data.category_id !== undefined) { updates.push('category_id = ?'); values.push(data.category_id); }
  if (data.name !== undefined) { updates.push('name = ?'); values.push(data.name); }
  if (data.price !== undefined) { updates.push('price = ?'); values.push(data.price); }
  if (data.sort_order !== undefined) { updates.push('sort_order = ?'); values.push(data.sort_order); }
  if (data.is_available !== undefined) { updates.push('is_available = ?'); values.push(data.is_available); }
  if (data.is_active !== undefined) { updates.push('is_active = ?'); values.push(data.is_active); }
  if ((data as any).availability_mode !== undefined) { updates.push('availability_mode = ?'); values.push((data as any).availability_mode); }

  if (updates.length > 0) {
    updates.push("updated_at = datetime('now')");
    values.push(id);
    getDb().prepare(`UPDATE menu_items SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }
  return getItem(id);
}

export function deleteItem(id: number): void {
  const result = getDb().prepare("UPDATE menu_items SET is_active = 0, updated_at = datetime('now') WHERE id = ?").run(id);
  if (result.changes === 0) throw new AppError(404, 'Artikel nicht gefunden');
}

export function toggleAvailability(id: number): MenuItem {
  const item = getItem(id);
  const newAvail = item.is_available ? 0 : 1;
  getDb().prepare("UPDATE menu_items SET is_available = ?, updated_at = datetime('now') WHERE id = ?").run(newAvail, id);
  return getItem(id);
}

export function toggleAvailabilityMode(id: number): MenuItem {
  const item = getItem(id);
  const newMode = (item as any).availability_mode === 'sofort' ? 'lieferzeit' : 'sofort';
  getDb().prepare("UPDATE menu_items SET availability_mode = ?, updated_at = datetime('now') WHERE id = ?").run(newMode, id);
  return getItem(id);
}

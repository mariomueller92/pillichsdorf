import { queryOne, queryAll, execute } from '../database.js';
import { MenuCategory, MenuItem } from '../shared/types.js';
import { AppError } from '../middleware/errorHandler.js';

// Categories
export async function listCategories(): Promise<MenuCategory[]> {
  return queryAll<MenuCategory>(
    'SELECT * FROM menu_categories WHERE is_active = true ORDER BY sort_order, name'
  );
}

export async function getCategory(id: number): Promise<MenuCategory> {
  const cat = await queryOne<MenuCategory>('SELECT * FROM menu_categories WHERE id = ?', [id]);
  if (!cat) throw new AppError(404, 'Kategorie nicht gefunden');
  return cat;
}

export async function createCategory(data: { name: string; sort_order: number; target: string }): Promise<MenuCategory> {
  const row = await queryOne<{ id: number }>(
    'INSERT INTO menu_categories (name, sort_order, target) VALUES (?, ?, ?) RETURNING id',
    [data.name, data.sort_order, data.target]
  );
  return getCategory(row!.id);
}

export async function updateCategory(id: number, data: Partial<MenuCategory>): Promise<MenuCategory> {
  await getCategory(id); // verify exists
  const updates: string[] = [];
  const values: any[] = [];

  if (data.name !== undefined) { updates.push('name = ?'); values.push(data.name); }
  if (data.sort_order !== undefined) { updates.push('sort_order = ?'); values.push(data.sort_order); }
  if (data.target !== undefined) { updates.push('target = ?'); values.push(data.target); }
  if (data.is_active !== undefined) { updates.push('is_active = ?'); values.push(data.is_active); }

  if (updates.length > 0) {
    updates.push('updated_at = now()');
    values.push(id);
    await execute(`UPDATE menu_categories SET ${updates.join(', ')} WHERE id = ?`, values);
  }
  return getCategory(id);
}

export async function deleteCategory(id: number): Promise<void> {
  const result = await execute("UPDATE menu_categories SET is_active = false, updated_at = now() WHERE id = ?", [id]);
  if (result.rowCount === 0) throw new AppError(404, 'Kategorie nicht gefunden');
}

// Items
export async function listItems(categoryId?: number): Promise<MenuItem[]> {
  if (categoryId) {
    return queryAll<MenuItem>(
      'SELECT * FROM menu_items WHERE category_id = ? AND is_active = true ORDER BY sort_order, name',
      [categoryId]
    );
  }
  return queryAll<MenuItem>(
    'SELECT * FROM menu_items WHERE is_active = true ORDER BY sort_order, name'
  );
}

export async function getItem(id: number): Promise<MenuItem> {
  const item = await queryOne<MenuItem>('SELECT * FROM menu_items WHERE id = ?', [id]);
  if (!item) throw new AppError(404, 'Artikel nicht gefunden');
  return item;
}

export async function createItem(data: { category_id: number; name: string; price: number; sort_order: number; jeton_type_id?: number | null }): Promise<MenuItem> {
  await getCategory(data.category_id); // verify category exists
  const row = await queryOne<{ id: number }>(
    'INSERT INTO menu_items (category_id, name, price, sort_order, jeton_type_id) VALUES (?, ?, ?, ?, ?) RETURNING id',
    [data.category_id, data.name, data.price, data.sort_order, data.jeton_type_id ?? null]
  );
  return getItem(row!.id);
}

export async function updateItem(id: number, data: Partial<MenuItem>): Promise<MenuItem> {
  await getItem(id); // verify exists
  const updates: string[] = [];
  const values: any[] = [];

  if (data.category_id !== undefined) { updates.push('category_id = ?'); values.push(data.category_id); }
  if (data.name !== undefined) { updates.push('name = ?'); values.push(data.name); }
  if (data.price !== undefined) { updates.push('price = ?'); values.push(data.price); }
  if (data.sort_order !== undefined) { updates.push('sort_order = ?'); values.push(data.sort_order); }
  if (data.is_available !== undefined) { updates.push('is_available = ?'); values.push(data.is_available); }
  if (data.is_active !== undefined) { updates.push('is_active = ?'); values.push(data.is_active); }
  if ((data as any).availability_mode !== undefined) { updates.push('availability_mode = ?'); values.push((data as any).availability_mode); }
  if (data.jeton_type_id !== undefined) { updates.push('jeton_type_id = ?'); values.push(data.jeton_type_id); }

  if (updates.length > 0) {
    updates.push('updated_at = now()');
    values.push(id);
    await execute(`UPDATE menu_items SET ${updates.join(', ')} WHERE id = ?`, values);
  }
  return getItem(id);
}

export async function deleteItem(id: number): Promise<void> {
  const result = await execute("UPDATE menu_items SET is_active = false, updated_at = now() WHERE id = ?", [id]);
  if (result.rowCount === 0) throw new AppError(404, 'Artikel nicht gefunden');
}

export async function toggleAvailability(id: number): Promise<MenuItem> {
  const item = await getItem(id);
  await execute("UPDATE menu_items SET is_available = ?, updated_at = now() WHERE id = ?", [!item.is_available, id]);
  return getItem(id);
}

export async function toggleAvailabilityMode(id: number): Promise<MenuItem> {
  const item = await getItem(id);
  const newMode = item.availability_mode === 'sofort' ? 'lieferzeit' : 'sofort';
  await execute("UPDATE menu_items SET availability_mode = ?, updated_at = now() WHERE id = ?", [newMode, id]);
  return getItem(id);
}

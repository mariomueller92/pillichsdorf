import { getDb } from '../database.js';
import { JetonType } from '../shared/types.js';
import { AppError } from '../middleware/errorHandler.js';

export function listJetonTypes(): JetonType[] {
  return getDb().prepare(
    'SELECT * FROM jeton_types WHERE is_active = 1 ORDER BY sort_order, name'
  ).all() as JetonType[];
}

export function getJetonType(id: number): JetonType {
  const jt = getDb().prepare('SELECT * FROM jeton_types WHERE id = ?').get(id) as JetonType | undefined;
  if (!jt) throw new AppError(404, 'Jeton-Typ nicht gefunden');
  return jt;
}

export function createJetonType(data: { name: string; color: string; value: number; sort_order: number }): JetonType {
  const result = getDb().prepare(
    'INSERT INTO jeton_types (name, color, value, sort_order) VALUES (?, ?, ?, ?)'
  ).run(data.name, data.color, data.value, data.sort_order);
  return getJetonType(result.lastInsertRowid as number);
}

export function updateJetonType(id: number, data: Partial<JetonType>): JetonType {
  getJetonType(id); // verify exists
  const updates: string[] = [];
  const values: any[] = [];

  if (data.name !== undefined) { updates.push('name = ?'); values.push(data.name); }
  if (data.color !== undefined) { updates.push('color = ?'); values.push(data.color); }
  if (data.value !== undefined) { updates.push('value = ?'); values.push(data.value); }
  if (data.sort_order !== undefined) { updates.push('sort_order = ?'); values.push(data.sort_order); }
  if (data.is_active !== undefined) { updates.push('is_active = ?'); values.push(data.is_active); }

  if (updates.length > 0) {
    updates.push("updated_at = datetime('now')");
    values.push(id);
    getDb().prepare(`UPDATE jeton_types SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }
  return getJetonType(id);
}

export function deleteJetonType(id: number): void {
  const result = getDb().prepare("UPDATE jeton_types SET is_active = 0, updated_at = datetime('now') WHERE id = ?").run(id);
  if (result.changes === 0) throw new AppError(404, 'Jeton-Typ nicht gefunden');
}

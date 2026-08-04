import { queryOne, queryAll, execute } from '../database.js';
import { JetonType } from '../shared/types.js';
import { AppError } from '../middleware/errorHandler.js';

export async function listJetonTypes(): Promise<JetonType[]> {
  return queryAll<JetonType>(
    'SELECT * FROM jeton_types WHERE is_active = true ORDER BY sort_order, name'
  );
}

export async function getJetonType(id: number): Promise<JetonType> {
  const jt = await queryOne<JetonType>('SELECT * FROM jeton_types WHERE id = ?', [id]);
  if (!jt) throw new AppError(404, 'Jeton-Typ nicht gefunden');
  return jt;
}

export async function createJetonType(data: { name: string; color: string; value: number; sort_order: number }): Promise<JetonType> {
  const row = await queryOne<{ id: number }>(
    'INSERT INTO jeton_types (name, color, value, sort_order) VALUES (?, ?, ?, ?) RETURNING id',
    [data.name, data.color, data.value, data.sort_order]
  );
  return getJetonType(row!.id);
}

export async function updateJetonType(id: number, data: Partial<JetonType>): Promise<JetonType> {
  await getJetonType(id); // verify exists
  const updates: string[] = [];
  const values: any[] = [];

  if (data.name !== undefined) { updates.push('name = ?'); values.push(data.name); }
  if (data.color !== undefined) { updates.push('color = ?'); values.push(data.color); }
  if (data.value !== undefined) { updates.push('value = ?'); values.push(data.value); }
  if (data.sort_order !== undefined) { updates.push('sort_order = ?'); values.push(data.sort_order); }
  if (data.is_active !== undefined) { updates.push('is_active = ?'); values.push(data.is_active); }

  if (updates.length > 0) {
    updates.push('updated_at = now()');
    values.push(id);
    await execute(`UPDATE jeton_types SET ${updates.join(', ')} WHERE id = ?`, values);
  }
  return getJetonType(id);
}

export async function deleteJetonType(id: number): Promise<void> {
  const result = await execute("UPDATE jeton_types SET is_active = false, updated_at = now() WHERE id = ?", [id]);
  if (result.rowCount === 0) throw new AppError(404, 'Jeton-Typ nicht gefunden');
}

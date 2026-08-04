import bcrypt from 'bcrypt';
import { queryOne, queryAll, execute } from '../database.js';
import { UserPublic } from '../shared/types.js';
import { AppError } from '../middleware/errorHandler.js';

export async function listUsers(role?: string): Promise<UserPublic[]> {
  if (role) {
    return queryAll<UserPublic>(
      'SELECT id, username, display_name, role, payment_mode, is_active FROM users WHERE role = ? ORDER BY display_name',
      [role]
    );
  }
  return queryAll<UserPublic>(
    'SELECT id, username, display_name, role, payment_mode, is_active FROM users ORDER BY display_name'
  );
}

export async function getUser(id: number): Promise<UserPublic> {
  const user = await queryOne<UserPublic>(
    'SELECT id, username, display_name, role, payment_mode, is_active FROM users WHERE id = ?',
    [id]
  );
  if (!user) throw new AppError(404, 'Benutzer nicht gefunden');
  return user;
}

export async function createUser(data: {
  username?: string | null;
  password?: string | null;
  pin?: string | null;
  display_name: string;
  role: string;
  payment_mode?: string;
}): Promise<UserPublic> {
  const passwordHash = data.password ? await bcrypt.hash(data.password, 10) : null;
  const pinHash = data.pin ? await bcrypt.hash(data.pin, 10) : null;
  // Kassa-SPK gibt ausschliesslich Jetons aus - Zahlungsart ist kein Nutzer-Setting
  const paymentMode = data.role === 'kassa_spk' ? 'jeton' : (data.payment_mode || 'bargeld');

  try {
    const row = await queryOne<{ id: number }>(`
      INSERT INTO users (username, password_hash, pin_hash, display_name, role, payment_mode)
      VALUES (?, ?, ?, ?, ?, ?) RETURNING id
    `, [data.username || null, passwordHash, pinHash, data.display_name, data.role, paymentMode]);

    return getUser(row!.id);
  } catch (err: any) {
    if (err.code === '23505') {
      throw new AppError(409, 'Benutzername bereits vergeben');
    }
    throw err;
  }
}

export async function updateUser(id: number, data: {
  username?: string | null;
  password?: string | null;
  pin?: string | null;
  display_name?: string;
  role?: string;
  payment_mode?: string;
  is_active?: boolean;
}): Promise<UserPublic> {
  const existing = await queryOne<{ role: string; payment_mode: string }>('SELECT * FROM users WHERE id = ?', [id]);
  if (!existing) throw new AppError(404, 'Benutzer nicht gefunden');

  const updates: string[] = [];
  const values: any[] = [];

  // Kassa-SPK gibt ausschliesslich Jetons aus - Zahlungsart ist kein Nutzer-Setting
  const effectiveRole = data.role ?? existing.role;
  if (effectiveRole === 'kassa_spk') {
    data.payment_mode = 'jeton';
  }

  if (data.username !== undefined) {
    updates.push('username = ?');
    values.push(data.username);
  }
  if (data.password) {
    updates.push('password_hash = ?');
    values.push(await bcrypt.hash(data.password, 10));
  }
  if (data.pin) {
    updates.push('pin_hash = ?');
    values.push(await bcrypt.hash(data.pin, 10));
  }
  if (data.display_name !== undefined) {
    updates.push('display_name = ?');
    values.push(data.display_name);
  }
  if (data.role !== undefined) {
    updates.push('role = ?');
    values.push(data.role);
  }
  if (data.payment_mode !== undefined) {
    updates.push('payment_mode = ?');
    values.push(data.payment_mode);
  }
  if (data.is_active !== undefined) {
    updates.push('is_active = ?');
    values.push(data.is_active);
  }

  if (updates.length > 0) {
    updates.push('updated_at = now()');
    values.push(id);
    try {
      await execute(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values);
    } catch (err: any) {
      if (err.code === '23505') {
        throw new AppError(409, 'Benutzername bereits vergeben');
      }
      throw err;
    }
  }

  return getUser(id);
}

export async function deleteUser(id: number): Promise<void> {
  const result = await execute("UPDATE users SET is_active = false, updated_at = now() WHERE id = ?", [id]);
  if (result.rowCount === 0) throw new AppError(404, 'Benutzer nicht gefunden');
}

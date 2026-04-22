import bcrypt from 'bcrypt';
import { getDb } from '../database.js';
import { UserPublic } from '../shared/types.js';
import { AppError } from '../middleware/errorHandler.js';

export function listUsers(role?: string): UserPublic[] {
  const db = getDb();
  if (role) {
    return db.prepare(
      'SELECT id, username, display_name, role, is_active FROM users WHERE role = ? ORDER BY display_name'
    ).all(role) as UserPublic[];
  }
  return db.prepare(
    'SELECT id, username, display_name, role, is_active FROM users ORDER BY display_name'
  ).all() as UserPublic[];
}

export function getUser(id: number): UserPublic {
  const db = getDb();
  const user = db.prepare(
    'SELECT id, username, display_name, role, is_active FROM users WHERE id = ?'
  ).get(id) as UserPublic | undefined;
  if (!user) throw new AppError(404, 'Benutzer nicht gefunden');
  return user;
}

export async function createUser(data: {
  username?: string | null;
  password?: string | null;
  pin?: string | null;
  display_name: string;
  role: string;
}): Promise<UserPublic> {
  const db = getDb();

  const passwordHash = data.password ? await bcrypt.hash(data.password, 10) : null;
  const pinHash = data.pin ? await bcrypt.hash(data.pin, 10) : null;

  try {
    const result = db.prepare(`
      INSERT INTO users (username, password_hash, pin_hash, display_name, role)
      VALUES (?, ?, ?, ?, ?)
    `).run(data.username || null, passwordHash, pinHash, data.display_name, data.role);

    return getUser(result.lastInsertRowid as number);
  } catch (err: any) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
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
  is_active?: number;
}): Promise<UserPublic> {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!existing) throw new AppError(404, 'Benutzer nicht gefunden');

  const updates: string[] = [];
  const values: any[] = [];

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
  if (data.is_active !== undefined) {
    updates.push('is_active = ?');
    values.push(data.is_active);
  }

  if (updates.length > 0) {
    updates.push("updated_at = datetime('now')");
    values.push(id);
    try {
      db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    } catch (err: any) {
      if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        throw new AppError(409, 'Benutzername bereits vergeben');
      }
      throw err;
    }
  }

  return getUser(id);
}

export function deleteUser(id: number): void {
  const db = getDb();
  const result = db.prepare("UPDATE users SET is_active = 0, updated_at = datetime('now') WHERE id = ?").run(id);
  if (result.changes === 0) throw new AppError(404, 'Benutzer nicht gefunden');
}

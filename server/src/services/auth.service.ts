import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { getDb } from '../database.js';
import { config } from '../config.js';
import { User, JwtPayload } from '../shared/types.js';
import { AppError } from '../middleware/errorHandler.js';

function signToken(user: User): string {
  const payload: JwtPayload = {
    userId: user.id,
    role: user.role,
    displayName: user.display_name,
  };
  return jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}

export function loginWithCredentials(username: string, password: string) {
  const db = getDb();
  const user = db.prepare(
    'SELECT * FROM users WHERE username = ? AND is_active = 1'
  ).get(username) as User | undefined;

  if (!user || !user.password_hash) {
    throw new AppError(401, 'Ungueltige Anmeldedaten');
  }

  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) {
    throw new AppError(401, 'Ungueltige Anmeldedaten');
  }

  return {
    token: signToken(user),
    user: {
      id: user.id,
      display_name: user.display_name,
      role: user.role,
      username: user.username,
    },
  };
}

export function loginWithPin(pin: string) {
  const db = getDb();
  const users = db.prepare(
    'SELECT * FROM users WHERE pin_hash IS NOT NULL AND is_active = 1'
  ).all() as User[];

  for (const user of users) {
    if (user.pin_hash && bcrypt.compareSync(pin, user.pin_hash)) {
      return {
        token: signToken(user),
        user: {
          id: user.id,
          display_name: user.display_name,
          role: user.role,
          username: user.username,
        },
      };
    }
  }

  throw new AppError(401, 'Ungueltiger PIN');
}

export function getUserFromToken(token: string) {
  try {
    const payload = jwt.verify(token, config.jwtSecret) as JwtPayload;
    const db = getDb();
    const user = db.prepare(
      'SELECT id, username, display_name, role, is_active FROM users WHERE id = ? AND is_active = 1'
    ).get(payload.userId) as any;
    if (!user) throw new AppError(401, 'Benutzer nicht gefunden');
    return user;
  } catch {
    throw new AppError(401, 'Token ungueltig');
  }
}

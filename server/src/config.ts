import dotenv from 'dotenv';
import path from 'path';

// Repo-Root = zwei Ebenen über server/src/ (stabil, unabhängig von CWD)
const REPO_ROOT = path.resolve(__dirname, '../..');
dotenv.config({ path: path.resolve(REPO_ROOT, '.env') });

// DB-Pfad CWD-unabhängig auflösen:
// Relative Pfade werden IMMER gegen den Repo-Root aufgelöst,
// damit die DB unabhängig davon, ob der Server aus /, /server oder
// sonstwo gestartet wird, immer am gleichen Ort liegt.
function resolveDbPath(): string {
  const raw = process.env.DB_PATH;
  if (!raw) return path.resolve(REPO_ROOT, 'server/data/pillichsdorf.db');
  return path.isAbsolute(raw) ? raw : path.resolve(REPO_ROOT, raw);
}

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  jwtSecret: process.env.JWT_SECRET || 'change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  dbPath: resolveDbPath(),
  printer: {
    enabled: process.env.PRINTER_ENABLED === 'true',
    name: process.env.PRINTER_NAME || 'Knub Thermica',
    width: parseInt(process.env.PRINTER_WIDTH || '32', 10),
  },
  company: {
    name: process.env.COMPANY_NAME || 'RAINER WEIN',
    address1: process.env.COMPANY_ADDRESS1 || '',
    address2: process.env.COMPANY_ADDRESS2 || '',
    betriebsnummer: process.env.COMPANY_BETRIEBSNUMMER || '',
    footer: process.env.COMPANY_FOOTER || 'Vielen Dank!',
  },
  logLevel: process.env.LOG_LEVEL || 'info',
};

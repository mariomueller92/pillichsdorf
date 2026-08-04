import dotenv from 'dotenv';
import path from 'path';

// Repo-Root = zwei Ebenen über server/src/ (stabil, unabhängig von CWD)
const REPO_ROOT = path.resolve(__dirname, '../..');
dotenv.config({ path: path.resolve(REPO_ROOT, '.env') });

// Firmenname/-adresse, Bon-Footer sowie Drucker-Name/-Breite sind seit der
// Mehrmandanten-Umstellung admin-editierbar in der DB (Tabelle "settings",
// siehe settings.service.ts) statt statisch aus .env. Die COMPANY_*/PRINTER_NAME/
// PRINTER_WIDTH env-Variablen wirken nur noch als Erstbefuellung dieser Zeile
// beim allerersten Migrationslauf (siehe database.ts).
export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  jwtSecret: process.env.JWT_SECRET || 'change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  databaseUrl: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/pillichsdorf',
  printer: {
    enabled: process.env.PRINTER_ENABLED === 'true',
  },
  printAgentToken: process.env.PRINT_AGENT_TOKEN || 'change-me',
  logLevel: process.env.LOG_LEVEL || 'info',
};

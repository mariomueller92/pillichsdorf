import fs from 'fs';
import path from 'path';
import { config } from './config.js';
import { runMigrations, seedDefaultData } from './database.js';

async function resetDb(): Promise<void> {
  if (process.env.CONFIRM_RESET !== 'yes') {
    console.error('');
    console.error('  ====================================================');
    console.error('  ACHTUNG: db:reset löscht die PRODUKTIVE Datenbank!');
    console.error('  ====================================================');
    console.error(`  DB-Pfad: ${config.dbPath}`);
    console.error('');
    console.error('  Um wirklich zurückzusetzen:');
    console.error('    CONFIRM_RESET=yes npm run db:reset');
    console.error('');
    console.error('  Ein Backup der aktuellen DB wird vor dem Löschen');
    console.error('  automatisch in <dbDir>/backups/ abgelegt.');
    console.error('');
    process.exit(1);
  }

  const dbPath = config.dbPath;
  const sideFiles = [dbPath, `${dbPath}-wal`, `${dbPath}-shm`];

  // Sicherheitsnetz: Backup erzeugen BEVOR gelöscht wird
  if (fs.existsSync(dbPath)) {
    const backupDir = path.join(path.dirname(dbPath), 'backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backup = path.join(backupDir, `pre-reset-${stamp}.db`);
    fs.copyFileSync(dbPath, backup);
    console.log(`[DB] Pre-Reset-Backup: ${backup}`);
  }

  for (const file of sideFiles) {
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
      console.log(`[DB] Datei geloescht: ${file}`);
    }
  }

  runMigrations();
  await seedDefaultData();

  console.log('[DB] Reset abgeschlossen');
}

resetDb()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[DB] Reset fehlgeschlagen:', err);
    process.exit(1);
  });

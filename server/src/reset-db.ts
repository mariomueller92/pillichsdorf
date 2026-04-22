import fs from 'fs';
import { config } from './config.js';
import { runMigrations, seedDefaultData } from './database.js';

async function resetDb(): Promise<void> {
  const dbPath = config.dbPath;
  const sideFiles = [dbPath, `${dbPath}-wal`, `${dbPath}-shm`];

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

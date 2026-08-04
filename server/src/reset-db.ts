import { config } from './config.js';
import { runMigrations, seedDefaultData, execute } from './database.js';

const ALL_TABLES = [
  'bill_items', 'bills', 'order_items', 'orders', 'tables',
  'menu_items', 'menu_categories', 'jeton_types', 'users',
  'print_jobs', 'settings', 'applied_migrations',
];

async function resetDb(): Promise<void> {
  if (process.env.CONFIRM_RESET !== 'yes') {
    console.error('');
    console.error('  ====================================================');
    console.error('  ACHTUNG: db:reset löscht die PRODUKTIVE Datenbank!');
    console.error('  ====================================================');
    console.error(`  DB: ${config.databaseUrl.replace(/:[^:@]*@/, ':***@')}`);
    console.error('');
    console.error('  Um wirklich zurückzusetzen:');
    console.error('    CONFIRM_RESET=yes npm run db:reset');
    console.error('');
    console.error('  Backups/Point-in-Time-Recovery übernimmt der Postgres-');
    console.error('  Provider (z.B. Neon-Branches) — hier gibt es kein');
    console.error('  automatisches Datei-Backup mehr.');
    console.error('');
    process.exit(1);
  }

  await runMigrations();
  await execute(`TRUNCATE TABLE ${ALL_TABLES.join(', ')} RESTART IDENTITY CASCADE`);
  console.log('[DB] Alle Tabellen geleert');

  await seedDefaultData();

  console.log('[DB] Reset abgeschlossen');
}

resetDb()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[DB] Reset fehlgeschlagen:', err);
    process.exit(1);
  });

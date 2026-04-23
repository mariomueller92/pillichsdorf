import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcrypt';
import { config } from './config.js';

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    const dir = path.dirname(config.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    db = new Database(config.dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

/**
 * Erzeugt einen Snapshot der DB vor jeder Migration.
 * Backup landet in <dbDir>/backups/pillichsdorf-<ISO-Zeitstempel>.db.
 * Beibehalten: letzte 20 Backups, ältere werden gelöscht.
 *
 * Wichtig: Das online-Backup-API von better-sqlite3 liest die DB inklusive
 * aktuellem WAL, d.h. auch nicht-checkpointete Writes werden korrekt gesichert.
 */
function backupBeforeMigration(): void {
  if (!fs.existsSync(config.dbPath)) return; // Erster Start – nichts zu sichern

  const dbDir = path.dirname(config.dbPath);
  const backupDir = path.join(dbDir, 'backups');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const target = path.join(backupDir, `pillichsdorf-${stamp}.db`);

  try {
    const source = new Database(config.dbPath, { readonly: true });
    // Synchrones Backup via VACUUM INTO — inkludiert WAL-Inhalt
    source.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
    source.close();
    console.log(`[DB] Backup erstellt: ${target}`);
  } catch (err) {
    console.error('[DB] Backup fehlgeschlagen:', err);
  }

  // Aufräumen: nur 20 jüngste Backups behalten
  try {
    const files = fs.readdirSync(backupDir)
      .filter(f => f.startsWith('pillichsdorf-') && f.endsWith('.db'))
      .map(f => ({ name: f, path: path.join(backupDir, f), mtime: fs.statSync(path.join(backupDir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    for (const old of files.slice(20)) {
      fs.unlinkSync(old.path);
    }
  } catch { /* ignore cleanup errors */ }
}

export function runMigrations(): void {
  // Immer zuerst Snapshot ziehen — so gehen bei keiner Schema-Änderung Daten verloren.
  backupBeforeMigration();

  const database = getDb();

  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      username        TEXT    UNIQUE,
      password_hash   TEXT,
      pin_hash        TEXT,
      display_name    TEXT    NOT NULL,
      role            TEXT    NOT NULL CHECK (role IN ('admin', 'kellner', 'kueche_schank')),
      is_active       INTEGER NOT NULL DEFAULT 1,
      created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS menu_categories (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      name            TEXT    NOT NULL,
      sort_order      INTEGER NOT NULL DEFAULT 0,
      target          TEXT    NOT NULL DEFAULT 'kueche'
                      CHECK (target IN ('kueche', 'schank')),
      is_active       INTEGER NOT NULL DEFAULT 1,
      created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS menu_items (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id     INTEGER NOT NULL REFERENCES menu_categories(id) ON DELETE RESTRICT,
      name            TEXT    NOT NULL,
      price           REAL    NOT NULL CHECK (price >= 0),
      sort_order      INTEGER NOT NULL DEFAULT 0,
      is_available    INTEGER NOT NULL DEFAULT 1,
      availability_mode TEXT  NOT NULL DEFAULT 'sofort'
                      CHECK (availability_mode IN ('sofort', 'lieferzeit')),
      is_active       INTEGER NOT NULL DEFAULT 1,
      created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tables (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      table_number    TEXT    NOT NULL UNIQUE,
      capacity        INTEGER,
      sort_order      INTEGER NOT NULL DEFAULT 0,
      status          TEXT    NOT NULL DEFAULT 'frei'
                      CHECK (status IN ('frei', 'besetzt', 'rechnung_angefordert')),
      merged_into_id  INTEGER REFERENCES tables(id) ON DELETE SET NULL,
      is_active       INTEGER NOT NULL DEFAULT 1,
      created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS orders (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      table_id        INTEGER REFERENCES tables(id) ON DELETE SET NULL,
      bar_slot        TEXT,
      waiter_id       INTEGER NOT NULL REFERENCES users(id),
      status          TEXT    NOT NULL DEFAULT 'offen'
                      CHECK (status IN ('offen', 'in_bearbeitung', 'fertig', 'serviert', 'storniert')),
      notes           TEXT,
      created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id        INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      menu_item_id    INTEGER NOT NULL REFERENCES menu_items(id),
      quantity        INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
      unit_price      REAL    NOT NULL,
      notes           TEXT,
      status          TEXT    NOT NULL DEFAULT 'neu'
                      CHECK (status IN ('neu', 'in_zubereitung', 'fertig', 'serviert', 'storniert')),
      acknowledged_by INTEGER REFERENCES users(id),
      acknowledged_at TEXT,
      created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS bills (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      table_id        INTEGER REFERENCES tables(id),
      waiter_id       INTEGER NOT NULL REFERENCES users(id),
      subtotal        REAL    NOT NULL,
      discount_type   TEXT    CHECK (discount_type IN ('percentage', 'fixed')),
      discount_value  REAL    DEFAULT 0,
      total           REAL    NOT NULL,
      notes           TEXT,
      created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS bill_items (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      bill_id         INTEGER NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
      order_item_id   INTEGER NOT NULL REFERENCES order_items(id),
      quantity        INTEGER NOT NULL DEFAULT 1,
      unit_price      REAL    NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_menu_items_category ON menu_items(category_id);
    CREATE INDEX IF NOT EXISTS idx_orders_table ON orders(table_id);
    CREATE INDEX IF NOT EXISTS idx_orders_waiter ON orders(waiter_id);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
    CREATE INDEX IF NOT EXISTS idx_order_items_status ON order_items(status);
    CREATE INDEX IF NOT EXISTS idx_bills_table ON bills(table_id);
    CREATE INDEX IF NOT EXISTS idx_bill_items_bill ON bill_items(bill_id);
  `);

  // ----------------------------------------------------------------
  // INKREMENTELLE MIGRATIONEN für bestehende (produktive) DBs
  // ----------------------------------------------------------------
  //
  // WICHTIG für zukünftige Schema-Änderungen: Die produktive DB darf
  // NIEMALS gelöscht oder neu erstellt werden. Stattdessen:
  //
  //   1. Tabelle existiert schon? → CREATE TABLE IF NOT EXISTS (oben).
  //   2. Neue Spalte? → mit PRAGMA table_info() prüfen, dann ALTER TABLE ADD COLUMN.
  //   3. Spaltentyp ändern / Spalte entfernen? → neuer Pattern:
  //        a) CREATE TABLE <name>_new mit neuem Schema
  //        b) INSERT INTO <name>_new SELECT ... FROM <name> (Daten migrieren!)
  //        c) DROP TABLE <name>
  //        d) ALTER TABLE <name>_new RENAME TO <name>
  //      Alles in einer Transaktion. Vor jeder Ausführung prüfen, ob die
  //      Änderung schon angewendet wurde (idempotent machen).
  //   4. Neue Tabelle? → CREATE TABLE IF NOT EXISTS oben ergänzen.
  //   5. NIEMALS TRUNCATE / DELETE FROM / DROP ohne Daten-Migration.
  //
  // Ein automatisches Backup wird VOR jeder Migration in
  // <dbDir>/backups/ angelegt — siehe backupBeforeMigration().
  // ----------------------------------------------------------------

  const tableCols = database.prepare("PRAGMA table_info(tables)").all() as { name: string }[];
  if (!tableCols.some(c => c.name === 'sort_order')) {
    database.exec("ALTER TABLE tables ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0");
    console.log('[DB] Migration: Spalte tables.sort_order hinzugefuegt');
  }

  const menuItemCols = database.prepare("PRAGMA table_info(menu_items)").all() as { name: string }[];
  if (!menuItemCols.some(c => c.name === 'availability_mode')) {
    database.exec("ALTER TABLE menu_items ADD COLUMN availability_mode TEXT NOT NULL DEFAULT 'sofort' CHECK (availability_mode IN ('sofort', 'lieferzeit'))");
    console.log('[DB] Migration: Spalte menu_items.availability_mode hinzugefügt');
  }

  // ----------------------------------------------------------------
  // Daten-Migrationen (einmalig, idempotent über applied_migrations)
  // ----------------------------------------------------------------
  database.exec(`
    CREATE TABLE IF NOT EXISTS applied_migrations (
      name        TEXT PRIMARY KEY,
      applied_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  runDataMigration(database, 'seed_menu_kgf_april26', seedMenuKgfApril26);

  console.log('[DB] Migrations ausgefuehrt');
}

/**
 * Führt eine benannte Daten-Migration genau einmal aus.
 * Marker liegt in applied_migrations; komplette Migration läuft in einer Transaktion.
 */
function runDataMigration(db: Database.Database, name: string, fn: (db: Database.Database) => void): void {
  const already = db.prepare('SELECT 1 FROM applied_migrations WHERE name = ?').get(name);
  if (already) return;
  const tx = db.transaction(() => {
    fn(db);
    db.prepare('INSERT INTO applied_migrations (name) VALUES (?)').run(name);
  });
  tx();
  console.log(`[DB] Migration angewendet: ${name}`);
}

/**
 * Speisekarte "KGF April 26" (Rainer Wein).
 * Bestehende Kategorien/Artikel werden sanft deaktiviert (is_active=0),
 * so dass historische Bestellungen/Rechnungen weiterhin auflösbar bleiben,
 * aber im UI nicht mehr auftauchen.
 */
function seedMenuKgfApril26(db: Database.Database): void {
  db.exec('UPDATE menu_items SET is_active = 0, updated_at = datetime(\'now\')');
  db.exec('UPDATE menu_categories SET is_active = 0, updated_at = datetime(\'now\')');

  const categories: Array<[string, number, 'schank' | 'kueche']> = [
    ['Weißwein & Rosé',     1, 'schank'],
    ['Rotwein',             2, 'schank'],
    ['Spezialwein & Rappa', 3, 'schank'],
    ['Flasche',             4, 'schank'],
    ['Keller',              5, 'schank'],
    ['Alkoholfrei',         6, 'schank'],
    ['Snacks',              7, 'schank'],
    ['Brote',               8, 'kueche'],
    ['Süßes',               9, 'kueche'],
  ];
  const insertCat = db.prepare('INSERT INTO menu_categories (name, sort_order, target) VALUES (?, ?, ?)');
  const catId: Record<string, number> = {};
  for (const [name, sort, target] of categories) {
    catId[name] = insertCat.run(name, sort, target).lastInsertRowid as number;
  }

  type Item = [cat: string, name: string, price: number, sort: number, mode: 'sofort' | 'lieferzeit'];
  const items: Item[] = [
    // Weißwein & Rosé (1/8)
    ['Weißwein & Rosé', 'Weinviertel DAC 2025 Black Edition',   3.50, 1, 'sofort'],
    ['Weißwein & Rosé', 'Weinviertel DAC 2025 Silver Edition',  4.00, 2, 'sofort'],
    ['Weißwein & Rosé', 'Grüner Veltliner Qualitätswein 2025',  3.00, 3, 'sofort'],
    ['Weißwein & Rosé', 'Welschriesling Qualitätswein 2025',    3.50, 4, 'sofort'],
    ['Weißwein & Rosé', 'Zweigelt Rosé Qualitätswein 2025',     4.00, 5, 'sofort'],
    ['Weißwein & Rosé', 'Weinviertel DAC 2024',                 3.50, 6, 'sofort'],
    ['Weißwein & Rosé', 'Weinviertel DAC 2024 Reserve',         4.50, 7, 'sofort'],
    ['Weißwein & Rosé', 'Grüner Veltliner 2024 halbtrocken',    3.00, 8, 'sofort'],
    ['Weißwein & Rosé', 'Riesling 2022',                        3.50, 9, 'sofort'],

    // Rotwein (1/8)
    ['Rotwein', 'Merlot 2024',             4.00, 1, 'sofort'],
    ['Rotwein', 'Blauburger 2024',         4.00, 2, 'sofort'],
    ['Rotwein', 'Trilogie 2023 Barrique',  4.50, 3, 'sofort'],
    ['Rotwein', 'Zweigelt 2022 Barrique',  4.50, 4, 'sofort'],

    // Spezialwein & Rappa (1/8 bzw. 2cl)
    ['Spezialwein & Rappa', 'PetNat 2023–2025',      5.00, 1, 'sofort'],
    ['Spezialwein & Rappa', 'OrangeWein 2022',       4.00, 2, 'sofort'],
    ['Spezialwein & Rappa', 'Rappa 2022–2024 2cl',   2.50, 3, 'sofort'],

    // Flasche (Tisch-Preise)
    ['Flasche', 'Weinviertel DAC 2025 Black Edition',  19.00,  1, 'sofort'],
    ['Flasche', 'Weinviertel DAC 2025 Silver Edition', 22.00,  2, 'sofort'],
    ['Flasche', 'Grüner Veltliner Qualitätswein 2025', 16.00,  3, 'sofort'],
    ['Flasche', 'Welschriesling Qualitätswein 2025',   10.00,  4, 'sofort'],
    ['Flasche', 'Zweigelt Rosé Qualitätswein 2025',    22.00,  5, 'sofort'],
    ['Flasche', 'Weinviertel DAC 2024',                19.00,  6, 'sofort'],
    ['Flasche', 'Weinviertel DAC 2024 Reserve',        25.00,  7, 'sofort'],
    ['Flasche', 'Grüner Veltliner 2024 halbtrocken',   16.00,  8, 'sofort'],
    ['Flasche', 'Riesling 2022',                       19.00,  9, 'sofort'],
    ['Flasche', 'Merlot 2024',                         22.00, 10, 'sofort'],
    ['Flasche', 'Blauburger 2024',                     22.00, 11, 'sofort'],
    ['Flasche', 'Trilogie 2023 Barrique',              25.00, 12, 'sofort'],
    ['Flasche', 'Zweigelt 2022 Barrique',              25.00, 13, 'sofort'],
    ['Flasche', 'PetNat 2023–2025',                    28.00, 14, 'sofort'],
    ['Flasche', 'OrangeWein 2022',                     22.00, 15, 'sofort'],
    ['Flasche', 'Rappa 2022–2024 0,33l',               14.00, 16, 'sofort'],

    // Keller (ab Keller 0,75l)
    ['Keller', 'Weinviertel DAC 2025 Black Edition',   7.00,  1, 'sofort'],
    ['Keller', 'Weinviertel DAC 2025 Silver Edition',  8.00,  2, 'sofort'],
    ['Keller', 'Grüner Veltliner Qualitätswein 2025',  6.00,  3, 'sofort'],
    ['Keller', 'Welschriesling Qualitätswein 2025',    7.00,  4, 'sofort'],
    ['Keller', 'Zweigelt Rosé Qualitätswein 2025',     9.00,  5, 'sofort'],
    ['Keller', 'Weinviertel DAC 2024',                 8.00,  6, 'sofort'],
    ['Keller', 'Weinviertel DAC 2024 Reserve',        13.00,  7, 'sofort'],
    ['Keller', 'Grüner Veltliner 2024 halbtrocken',    6.00,  8, 'sofort'],
    ['Keller', 'Riesling 2022',                        7.00,  9, 'sofort'],
    ['Keller', 'Merlot 2024',                          8.00, 10, 'sofort'],
    ['Keller', 'Blauburger 2024',                      8.00, 11, 'sofort'],
    ['Keller', 'Trilogie 2023 Barrique',               9.00, 12, 'sofort'],
    ['Keller', 'Zweigelt 2022 Barrique',               9.00, 13, 'sofort'],
    ['Keller', 'PetNat 2023–2025',                    11.00, 14, 'sofort'],
    ['Keller', 'OrangeWein 2022',                      9.00, 15, 'sofort'],

    // Alkoholfrei
    ['Alkoholfrei', 'Gspritzter 1/4',             2.50,  1, 'sofort'],
    ['Alkoholfrei', 'Gspritzter 1/2',             4.00,  2, 'sofort'],
    ['Alkoholfrei', 'Traubensaft Natur 1/4',      3.00,  3, 'sofort'],
    ['Alkoholfrei', 'Traubensaft Natur 1/2',      5.00,  4, 'sofort'],
    ['Alkoholfrei', 'Traubensaft Leitung 1/4',    3.00,  5, 'sofort'],
    ['Alkoholfrei', 'Traubensaft Leitung 1/2',    5.00,  6, 'sofort'],
    ['Alkoholfrei', 'Traubensaft gespritzt 1/4',  2.50,  7, 'sofort'],
    ['Alkoholfrei', 'Traubensaft gespritzt 1/2',  4.00,  8, 'sofort'],
    ['Alkoholfrei', 'Sodawasser 1/4',             1.50,  9, 'sofort'],
    ['Alkoholfrei', 'Sodawasser 1,5l',            6.00, 10, 'sofort'],

    // Snacks
    ['Snacks', 'Popcorn klein', 2.00, 1, 'sofort'],
    ['Snacks', 'Popcorn groß',  4.00, 2, 'sofort'],

    // Brote (je € 4,50)
    ['Brote', 'Brot Schinken',           4.50,  1, 'lieferzeit'],
    ['Brote', 'Brot Speck',              4.50,  2, 'lieferzeit'],
    ['Brote', 'Brot Thunfisch',          4.50,  3, 'lieferzeit'],
    ['Brote', 'Brot Schweinsbratl',      4.50,  4, 'lieferzeit'],
    ['Brote', 'Brot Kümmelbratl',        4.50,  5, 'lieferzeit'],
    ['Brote', 'Brot Käse',               4.50,  6, 'lieferzeit'],
    ['Brote', 'Brot Obatzen',            4.50,  7, 'lieferzeit'],
    ['Brote', 'Brot Erdäpfelkas',        4.50,  8, 'lieferzeit'],
    ['Brote', 'Brot Eieraufstrich',      4.50,  9, 'lieferzeit'],
    ['Brote', 'Brot Veganer Aufstrich',  4.50, 10, 'lieferzeit'],

    // Süßes (je € 3,50)
    ['Süßes', 'Schaumrollen',          3.50, 1, 'lieferzeit'],
    ['Süßes', 'Sachertorte',           3.50, 2, 'lieferzeit'],
    ['Süßes', 'Cheesecake',            3.50, 3, 'lieferzeit'],
    ['Süßes', 'Obstkuchen',            3.50, 4, 'lieferzeit'],
    ['Süßes', 'Bisquitroulade',        3.50, 5, 'lieferzeit'],
    ['Süßes', 'Veganer Apfelkuchen',   3.50, 6, 'lieferzeit'],
    ['Süßes', 'Topfenstrudel',         3.50, 7, 'lieferzeit'],
  ];

  const insertItem = db.prepare(
    'INSERT INTO menu_items (category_id, name, price, sort_order, availability_mode) VALUES (?, ?, ?, ?, ?)'
  );
  for (const [cat, name, price, sort, mode] of items) {
    insertItem.run(catId[cat], name, price, sort, mode);
  }
}

export async function seedDefaultData(): Promise<void> {
  const database = getDb();

  // Admin user
  const existingAdmin = database.prepare('SELECT id FROM users WHERE username = ?').get('admin');
  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash('admin', 10);
    const pinHash = await bcrypt.hash('0000', 10);
    database.prepare(`
      INSERT INTO users (username, password_hash, pin_hash, display_name, role)
      VALUES (?, ?, ?, ?, ?)
    `).run('admin', passwordHash, pinHash, 'Administrator', 'admin');
    console.log('[DB] Default-Admin erstellt (admin/admin, PIN: 0000)');
  }

  // Kellner
  const existingKellner = database.prepare('SELECT id FROM users WHERE display_name = ?').get('Kellner 1');
  if (!existingKellner) {
    const pinHash1 = await bcrypt.hash('1111', 10);
    const pinHash2 = await bcrypt.hash('2222', 10);
    database.prepare(`INSERT INTO users (pin_hash, display_name, role) VALUES (?, ?, ?)`).run(pinHash1, 'Kellner 1', 'kellner');
    database.prepare(`INSERT INTO users (pin_hash, display_name, role) VALUES (?, ?, ?)`).run(pinHash2, 'Kellner 2', 'kellner');
    console.log('[DB] Demo-Kellner erstellt (PIN: 1111, 2222)');
  }

  // Schank-Chef (Dashboard am Laptop)
  const existingSchank = database.prepare('SELECT id FROM users WHERE display_name = ?').get('Schank-Chef');
  if (!existingSchank) {
    const pinHash = await bcrypt.hash('9999', 10);
    database.prepare(`INSERT INTO users (pin_hash, display_name, role) VALUES (?, ?, ?)`).run(pinHash, 'Schank-Chef', 'kueche_schank');
    console.log('[DB] Demo-Schank-Chef erstellt (PIN: 9999)');
  }

  // Tables
  const existingTables = database.prepare('SELECT COUNT(*) as count FROM tables').get() as any;
  if (existingTables.count === 0) {
    const insertTable = database.prepare('INSERT INTO tables (table_number, capacity) VALUES (?, ?)');
    for (let i = 1; i <= 10; i++) {
      insertTable.run(String(i), i <= 5 ? 4 : 6);
    }
    console.log('[DB] 10 Demo-Tische erstellt');
  }

  // Menu categories + items
  const existingCats = database.prepare('SELECT COUNT(*) as count FROM menu_categories').get() as any;
  if (existingCats.count === 0) {
    const insertCat = database.prepare('INSERT INTO menu_categories (name, sort_order, target) VALUES (?, ?, ?)');
    insertCat.run('Brote', 1, 'kueche');           // 1 - Lieferzeit (aus dem Keller)
    insertCat.run('Mehlspeisen', 2, 'kueche');      // 2 - Lieferzeit
    insertCat.run('Aufstriche', 3, 'kueche');        // 3 - Lieferzeit
    insertCat.run('Vitrine', 4, 'schank');           // 4 - Sofort (Theke)
    insertCat.run('Wein', 5, 'schank');              // 5 - Sofort
    insertCat.run('Saft & Wasser', 6, 'schank');     // 6 - Sofort
    insertCat.run('Sonstiges', 7, 'schank');         // 7 - Sofort

    // (category_id, name, price, sort_order, availability_mode)
    const insertItem = database.prepare('INSERT INTO menu_items (category_id, name, price, sort_order, availability_mode) VALUES (?, ?, ?, ?, ?)');
    // Brote (1) - Lieferzeit
    insertItem.run(1, 'Bauernbrot', 3.50, 1, 'lieferzeit');
    insertItem.run(1, 'Kornspitz', 2.50, 2, 'lieferzeit');
    insertItem.run(1, 'Laugenstangerl', 2.80, 3, 'lieferzeit');
    // Mehlspeisen (2) - Lieferzeit
    insertItem.run(2, 'Topfenstrudel', 4.50, 1, 'lieferzeit');
    insertItem.run(2, 'Apfelstrudel', 4.50, 2, 'lieferzeit');
    insertItem.run(2, 'Buchteln', 5.00, 3, 'lieferzeit');
    // Aufstriche (3) - Lieferzeit
    insertItem.run(3, 'Liptauer', 3.50, 1, 'lieferzeit');
    insertItem.run(3, 'Grammelschmalz', 3.50, 2, 'lieferzeit');
    insertItem.run(3, 'Kuerbiskernaufstrich', 3.50, 3, 'lieferzeit');
    // Vitrine (4) - Sofort
    insertItem.run(4, 'Kanape Schinken', 3.00, 1, 'sofort');
    insertItem.run(4, 'Kanape Lachs', 3.50, 2, 'sofort');
    insertItem.run(4, 'Kanape Aufstrich', 2.80, 3, 'sofort');
    insertItem.run(4, 'Brotchips', 2.50, 4, 'sofort');
    // Wein (5) - Sofort
    insertItem.run(5, 'Gruener Veltliner 1/8', 3.00, 1, 'sofort');
    insertItem.run(5, 'Gruener Veltliner 1/4', 4.50, 2, 'sofort');
    insertItem.run(5, 'Zweigelt 1/8', 3.20, 3, 'sofort');
    insertItem.run(5, 'Zweigelt 1/4', 4.80, 4, 'sofort');
    insertItem.run(5, 'Spritzer 1/4', 3.50, 5, 'sofort');
    insertItem.run(5, 'Sturm 1/4', 3.00, 6, 'sofort');
    // Saft & Wasser (6) - Sofort
    insertItem.run(6, 'Apfelsaft gespritzt', 3.00, 1, 'sofort');
    insertItem.run(6, 'Traubensaft', 3.00, 2, 'sofort');
    insertItem.run(6, 'Mineralwasser 0.3l', 2.50, 3, 'sofort');
    insertItem.run(6, 'Orangensaft', 3.20, 4, 'sofort');
    // Sonstiges (7) - Sofort
    insertItem.run(7, 'Bier 0.5l', 4.00, 1, 'sofort');
    insertItem.run(7, 'Bier 0.3l', 3.00, 2, 'sofort');
    insertItem.run(7, 'Radler 0.5l', 3.80, 3, 'sofort');
    insertItem.run(7, 'Kaffee', 2.80, 4, 'sofort');

    console.log('[DB] Demo-Speisekarte erstellt (7 Kategorien, Winzer-Heuriger)');
  }
}

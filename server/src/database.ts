import { Pool, PoolClient, types } from 'pg';
import bcrypt from 'bcrypt';
import { config } from './config.js';

// Postgres liefert bigint (COUNT) und numeric (SUM/AVG über INTEGER-Spalten) standardmäßig
// als Strings, um Präzisionsverlust bei sehr großen Werten zu vermeiden. Für diese App
// (Restaurantbetrieb, keine astronomischen Summen) ist das unnötig und würde an sehr vielen
// Aggregat-Stellen (COUNT/SUM in Subqueries) stillschweigend Zahlen-Arithmetik brechen.
types.setTypeParser(20 /* int8 */, (val) => parseInt(val, 10));
types.setTypeParser(1700 /* numeric */, (val) => parseFloat(val));

let pool: Pool;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: config.databaseUrl });
  }
  return pool;
}

type Queryable = Pool | PoolClient;

/** Übersetzt SQLite-Stil `?`-Platzhalter (in Reihenfolge) nach Postgres `$1, $2, ...`. */
function toPositional(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

export async function queryAll<T = any>(sql: string, params: any[] = [], client: Queryable = getPool()): Promise<T[]> {
  const res = await client.query(toPositional(sql), params);
  return res.rows as T[];
}

export async function queryOne<T = any>(sql: string, params: any[] = [], client: Queryable = getPool()): Promise<T | undefined> {
  const rows = await queryAll<T>(sql, params, client);
  return rows[0];
}

export async function execute(sql: string, params: any[] = [], client: Queryable = getPool()): Promise<{ rowCount: number }> {
  const res = await client.query(toPositional(sql), params);
  return { rowCount: res.rowCount ?? 0 };
}

export interface Tx {
  queryAll<T = any>(sql: string, params?: any[]): Promise<T[]>;
  queryOne<T = any>(sql: string, params?: any[]): Promise<T | undefined>;
  execute(sql: string, params?: any[]): Promise<{ rowCount: number }>;
}

/** Ersetzt das synchrone `db.transaction(fn)()`-Muster von better-sqlite3. */
export async function withTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const tx: Tx = {
      queryAll: (sql, params = []) => queryAll(sql, params, client),
      queryOne: (sql, params = []) => queryOne(sql, params, client),
      execute: (sql, params = []) => execute(sql, params, client),
    };
    const result = await fn(tx);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function runMigrations(): Promise<void> {
  await execute(`
    CREATE TABLE IF NOT EXISTS users (
      id              INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      username        TEXT    UNIQUE,
      password_hash   TEXT,
      pin_hash        TEXT,
      display_name    TEXT    NOT NULL,
      role            TEXT    NOT NULL CHECK (role IN ('admin', 'kellner', 'kueche_schank', 'schank_kellner', 'kassa_spk')),
      payment_mode    TEXT    NOT NULL DEFAULT 'bargeld'
                      CHECK (payment_mode IN ('bargeld', 'jeton')),
      is_active       BOOLEAN NOT NULL DEFAULT true,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS jeton_types (
      id              INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      name            TEXT    NOT NULL,
      color           TEXT    NOT NULL,
      value           DOUBLE PRECISION NOT NULL CHECK (value >= 0),
      sort_order      INTEGER NOT NULL DEFAULT 0,
      is_active       BOOLEAN NOT NULL DEFAULT true,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS menu_categories (
      id              INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      name            TEXT    NOT NULL,
      sort_order      INTEGER NOT NULL DEFAULT 0,
      target          TEXT    NOT NULL DEFAULT 'kueche'
                      CHECK (target IN ('kueche', 'schank')),
      is_active       BOOLEAN NOT NULL DEFAULT true,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS menu_items (
      id              INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      category_id     INTEGER NOT NULL REFERENCES menu_categories(id) ON DELETE RESTRICT,
      name            TEXT    NOT NULL,
      price           DOUBLE PRECISION NOT NULL CHECK (price >= 0),
      sort_order      INTEGER NOT NULL DEFAULT 0,
      is_available    BOOLEAN NOT NULL DEFAULT true,
      availability_mode TEXT  NOT NULL DEFAULT 'sofort'
                      CHECK (availability_mode IN ('sofort', 'lieferzeit')),
      jeton_type_id   INTEGER REFERENCES jeton_types(id) ON DELETE SET NULL,
      is_active       BOOLEAN NOT NULL DEFAULT true,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS tables (
      id              INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      table_number    TEXT    NOT NULL UNIQUE,
      capacity        INTEGER,
      sort_order      INTEGER NOT NULL DEFAULT 0,
      status          TEXT    NOT NULL DEFAULT 'frei'
                      CHECK (status IN ('frei', 'besetzt')),
      merged_into_id  INTEGER REFERENCES tables(id) ON DELETE SET NULL,
      is_active       BOOLEAN NOT NULL DEFAULT true,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS orders (
      id              INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      table_id        INTEGER REFERENCES tables(id) ON DELETE SET NULL,
      bar_slot        TEXT,
      waiter_id       INTEGER NOT NULL REFERENCES users(id),
      status          TEXT    NOT NULL DEFAULT 'offen'
                      CHECK (status IN ('offen', 'in_bearbeitung', 'fertig', 'serviert', 'storniert')),
      notes           TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id              INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      order_id        INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      menu_item_id    INTEGER NOT NULL REFERENCES menu_items(id),
      quantity        INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
      unit_price      DOUBLE PRECISION NOT NULL,
      notes           TEXT,
      status          TEXT    NOT NULL DEFAULT 'neu'
                      CHECK (status IN ('neu', 'in_zubereitung', 'fertig', 'serviert', 'storniert')),
      acknowledged_by INTEGER REFERENCES users(id),
      acknowledged_at TIMESTAMPTZ,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS bills (
      id              INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      table_id        INTEGER REFERENCES tables(id),
      waiter_id       INTEGER NOT NULL REFERENCES users(id),
      subtotal        DOUBLE PRECISION NOT NULL,
      discount_type   TEXT    CHECK (discount_type IN ('percentage', 'fixed')),
      discount_value  DOUBLE PRECISION DEFAULT 0,
      total           DOUBLE PRECISION NOT NULL,
      payment_mode    TEXT    NOT NULL DEFAULT 'bargeld'
                      CHECK (payment_mode IN ('bargeld', 'jeton')),
      notes           TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS bill_items (
      id              INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      bill_id         INTEGER NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
      order_item_id   INTEGER NOT NULL REFERENCES order_items(id),
      quantity        INTEGER NOT NULL DEFAULT 1,
      unit_price      DOUBLE PRECISION NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      id                      INTEGER PRIMARY KEY CHECK (id = 1),
      company_name            TEXT    NOT NULL DEFAULT 'RAINER WEIN',
      company_address1        TEXT    NOT NULL DEFAULT '',
      company_address2        TEXT    NOT NULL DEFAULT '',
      company_betriebsnummer  TEXT    NOT NULL DEFAULT '',
      company_footer          TEXT    NOT NULL DEFAULT 'Vielen Dank!',
      printer_name             TEXT   NOT NULL DEFAULT 'Knub Thermica',
      printer_width            INTEGER NOT NULL DEFAULT 58,
      updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS print_jobs (
      id              INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      type            TEXT    NOT NULL CHECK (type IN ('bon', 'rechnung')),
      rendered_content TEXT   NOT NULL,
      status          TEXT    NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'done', 'failed')),
      error_message   TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      completed_at    TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS applied_migrations (
      name        TEXT PRIMARY KEY,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_menu_items_category ON menu_items(category_id);
    CREATE INDEX IF NOT EXISTS idx_menu_items_jeton_type ON menu_items(jeton_type_id);
    CREATE INDEX IF NOT EXISTS idx_orders_table ON orders(table_id);
    CREATE INDEX IF NOT EXISTS idx_orders_waiter ON orders(waiter_id);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
    CREATE INDEX IF NOT EXISTS idx_order_items_status ON order_items(status);
    CREATE INDEX IF NOT EXISTS idx_bills_table ON bills(table_id);
    CREATE INDEX IF NOT EXISTS idx_bill_items_bill ON bill_items(bill_id);
    CREATE INDEX IF NOT EXISTS idx_print_jobs_status ON print_jobs(status);
  `);

  // Einmalige Erstbefuellung der settings-Zeile aus den .env-Werten,
  // damit bestehende Installationen unveraendert weiterlaufen.
  const settingsRow = await queryOne('SELECT id FROM settings WHERE id = 1');
  if (!settingsRow) {
    await execute(`
      INSERT INTO settings (id, company_name, company_address1, company_address2, company_betriebsnummer, company_footer, printer_name, printer_width)
      VALUES (1, ?, ?, ?, ?, ?, ?, ?)
    `, [
      process.env.COMPANY_NAME || 'RAINER WEIN',
      process.env.COMPANY_ADDRESS1 || '',
      process.env.COMPANY_ADDRESS2 || '',
      process.env.COMPANY_BETRIEBSNUMMER || '',
      process.env.COMPANY_FOOTER || 'Vielen Dank!',
      process.env.PRINTER_NAME || 'Knub Thermica',
      parseInt(process.env.PRINTER_WIDTH || '58', 10)
    ]);
    console.log('[DB] Migration: settings-Zeile aus .env-Werten angelegt');
  }

  console.log('[DB] Migrations ausgefuehrt');
}

/**
 * Führt eine benannte Daten-Migration genau einmal aus (für künftige Schema-/Datenänderungen).
 * Marker liegt in applied_migrations; komplette Migration läuft in einer Transaktion.
 */
export async function runDataMigration(name: string, fn: (tx: Tx) => Promise<void>): Promise<void> {
  const already = await queryOne('SELECT 1 FROM applied_migrations WHERE name = ?', [name]);
  if (already) return;
  await withTransaction(async (tx) => {
    await fn(tx);
    await tx.execute('INSERT INTO applied_migrations (name) VALUES (?)', [name]);
  });
  console.log(`[DB] Migration angewendet: ${name}`);
}

/**
 * Speisekarte "KGF April 26" (Rainer Wein).
 */
const MENU_CATEGORIES: Array<[string, number, 'schank' | 'kueche']> = [
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

type MenuItemSeed = [cat: string, name: string, price: number, sort: number, mode: 'sofort' | 'lieferzeit'];
const MENU_ITEMS: MenuItemSeed[] = [
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

export async function seedDefaultData(): Promise<void> {
  // Admin user
  const existingAdmin = await queryOne('SELECT id FROM users WHERE username = ?', ['admin']);
  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash('admin', 10);
    const pinHash = await bcrypt.hash('0000', 10);
    await execute(`
      INSERT INTO users (username, password_hash, pin_hash, display_name, role)
      VALUES (?, ?, ?, ?, ?)
    `, ['admin', passwordHash, pinHash, 'Administrator', 'admin']);
    console.log('[DB] Default-Admin erstellt (admin/admin, PIN: 0000)');
  }

  // Kellner
  const existingKellner = await queryOne('SELECT id FROM users WHERE display_name = ?', ['Kellner 1']);
  if (!existingKellner) {
    const pinHash1 = await bcrypt.hash('1111', 10);
    const pinHash2 = await bcrypt.hash('2222', 10);
    await execute(`INSERT INTO users (pin_hash, display_name, role) VALUES (?, ?, ?)`, [pinHash1, 'Kellner 1', 'kellner']);
    await execute(`INSERT INTO users (pin_hash, display_name, role) VALUES (?, ?, ?)`, [pinHash2, 'Kellner 2', 'kellner']);
    console.log('[DB] Demo-Kellner erstellt (PIN: 1111, 2222)');
  }

  // Schank-Chef (Dashboard am Laptop)
  const existingSchank = await queryOne('SELECT id FROM users WHERE display_name = ?', ['Schank-Chef']);
  if (!existingSchank) {
    const pinHash = await bcrypt.hash('9999', 10);
    await execute(`INSERT INTO users (pin_hash, display_name, role) VALUES (?, ?, ?)`, [pinHash, 'Schank-Chef', 'kueche_schank']);
    console.log('[DB] Demo-Schank-Chef erstellt (PIN: 9999)');
  }

  // Schank-Kellner (Verkauf direkt an der Schank, ohne Tisch/Status-Tracking)
  const existingSchankKellner = await queryOne('SELECT id FROM users WHERE display_name = ?', ['Schank-Kellner']);
  if (!existingSchankKellner) {
    const pinHash = await bcrypt.hash('8888', 10);
    await execute(`INSERT INTO users (pin_hash, display_name, role) VALUES (?, ?, ?)`, [pinHash, 'Schank-Kellner', 'schank_kellner']);
    console.log('[DB] Demo-Schank-Kellner erstellt (PIN: 8888)');
  }

  // Kassa-SPK (Zentralkasse, 8-stelliger PIN, zahlt immer in Jetons)
  const existingKassaSpk = await queryOne('SELECT id FROM users WHERE display_name = ?', ['Kassa-SPK']);
  if (!existingKassaSpk) {
    const pinHash = await bcrypt.hash('12345678', 10);
    await execute(`INSERT INTO users (pin_hash, display_name, role, payment_mode) VALUES (?, ?, ?, ?)`, [pinHash, 'Kassa-SPK', 'kassa_spk', 'jeton']);
    console.log('[DB] Demo-Kassa-SPK erstellt (PIN: 12345678)');
  }

  // Tables
  const existingTables = await queryOne<{ count: number }>('SELECT COUNT(*) as count FROM tables');
  if (existingTables && existingTables.count === 0) {
    for (let i = 1; i <= 10; i++) {
      await execute('INSERT INTO tables (table_number, capacity) VALUES (?, ?)', [String(i), i <= 5 ? 4 : 6]);
    }
    console.log('[DB] 10 Demo-Tische erstellt');
  }

  // Menu categories + items (Speisekarte "KGF April 26")
  const existingCats = await queryOne<{ count: number }>('SELECT COUNT(*) as count FROM menu_categories');
  if (existingCats && existingCats.count === 0) {
    const catId: Record<string, number> = {};
    for (const [name, sort, target] of MENU_CATEGORIES) {
      const row = await queryOne<{ id: number }>(
        'INSERT INTO menu_categories (name, sort_order, target) VALUES (?, ?, ?) RETURNING id',
        [name, sort, target]
      );
      catId[name] = row!.id;
    }
    for (const [cat, name, price, sort, mode] of MENU_ITEMS) {
      await execute(
        'INSERT INTO menu_items (category_id, name, price, sort_order, availability_mode) VALUES (?, ?, ?, ?, ?)',
        [catId[cat], name, price, sort, mode]
      );
    }
    console.log('[DB] Demo-Speisekarte erstellt (9 Kategorien, KGF April 26)');
  }
}

// Erlaubt `npm run migrate` (tsx src/database.ts direkt ausgefuehrt) zusaetzlich zum
// Aufruf aus index.ts beim Server-Boot.
if (require.main === module) {
  runMigrations()
    .then(() => {
      console.log('[DB] migrate abgeschlossen');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[DB] migrate fehlgeschlagen:', err);
      process.exit(1);
    });
}

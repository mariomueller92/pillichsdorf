#!/usr/bin/env node
/**
 * DB-Backup-Skript.
 * Kopiert die produktive DB nach server/data/backups/<prefix>-<ISO>.db.
 * Aufruf:
 *   node scripts/backup-db.mjs            (prefix: manual)
 *   node scripts/backup-db.mjs post-merge (z.B. aus git-hook)
 *   node scripts/backup-db.mjs pre-pull   (vor git pull)
 *
 * Inkludiert WAL-Inhalt via VACUUM INTO (better-sqlite3) wenn verfügbar,
 * sonst plain copyFile als Fallback.
 *
 * Behält die jüngsten 50 Backups dieses Prefixes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

// DB-Pfad konsistent zu server/src/config.ts auflösen
const envPath = process.env.DB_PATH;
const dbPath = envPath
  ? (path.isAbsolute(envPath) ? envPath : path.resolve(repoRoot, envPath))
  : path.resolve(repoRoot, 'server/data/pillichsdorf.db');

if (!fs.existsSync(dbPath)) {
  console.log(`[backup-db] Keine DB gefunden unter ${dbPath} – nichts zu sichern.`);
  process.exit(0);
}

const prefix = (process.argv[2] || 'manual').replace(/[^a-z0-9-]/gi, '-');
const backupDir = path.join(path.dirname(dbPath), 'backups');
fs.mkdirSync(backupDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const target = path.join(backupDir, `${prefix}-${stamp}.db`);

let used = 'copyFile';
try {
  const mod = await import('better-sqlite3').catch(() => null);
  if (mod) {
    const Database = mod.default || mod;
    const src = new Database(dbPath, { readonly: true });
    src.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
    src.close();
    used = 'VACUUM INTO';
  } else {
    fs.copyFileSync(dbPath, target);
  }
} catch (err) {
  console.warn(`[backup-db] VACUUM INTO fehlgeschlagen, nutze copyFile: ${err?.message || err}`);
  fs.copyFileSync(dbPath, target);
}

console.log(`[backup-db] Backup angelegt (${used}): ${target}`);

// Aufräumen: 50 jüngste Backups pro Prefix behalten
try {
  const files = fs.readdirSync(backupDir)
    .filter(f => f.startsWith(`${prefix}-`) && f.endsWith('.db'))
    .map(f => ({ name: f, p: path.join(backupDir, f), m: fs.statSync(path.join(backupDir, f)).mtimeMs }))
    .sort((a, b) => b.m - a.m);
  for (const old of files.slice(50)) {
    fs.unlinkSync(old.p);
  }
} catch { /* ignore */ }

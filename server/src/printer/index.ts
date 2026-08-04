// Lokale Druckausführung — läuft ausschließlich im Print-Agent (server/src/print-agent/agent.ts)
// auf der Windows-Maschine am Drucker, NICHT im (serverless) Server-Prozess.
import fs from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import os from 'os';
import { sanitizeForPrint, toCp1252 } from './receipt.js';

let enabled = false;
let printerName = '';

// Wird vom Print-Agent bei jedem Poll-Zyklus aufgerufen, damit Admin-Änderungen an
// Drucker-Name/Aktiv-Status (via Settings-UI) ohne Neustart des Agents greifen.
export function setPrinterConfig(name: string, isEnabled: boolean): void {
  printerName = name;
  enabled = isEnabled;
}

export function isPrinterEnabled(): boolean {
  return enabled;
}

// Prüft beim Agent-Start, ob der konfigurierte Drucker unter Windows bekannt ist.
export function checkPrinterInstalled(): boolean {
  try {
    const output = execSync('wmic printer get name', { encoding: 'utf-8' });
    const printers = output.split('\n').map(l => l.trim()).filter(Boolean);
    const found = printers.some(p => p.toLowerCase().includes(printerName.toLowerCase()));
    if (found) {
      console.log(`[Drucker] Gefunden: ${printerName}`);
    } else {
      console.log(`[Drucker] WARNUNG: "${printerName}" nicht gefunden. Verfuegbare Drucker:`);
      printers.forEach(p => p !== 'Name' && console.log(`  - ${p}`));
    }
    return found;
  } catch {
    console.log('[Drucker] Konnte Druckerliste nicht abfragen');
    return false;
  }
}

const RAW_PRINT_SCRIPT = path.join(__dirname, 'raw-print.ps1');

export function printRaw(content: string): boolean {
  if (!enabled) {
    console.log('[Drucker] Deaktiviert - Druckauftrag verworfen');
    return false;
  }

  // content ist ein UTF-8 String vom ReceiptBuilder → zunächst alle Umlaute/Akzente
  // transliterieren (Rosé→Rose, ä→ae usw.), dann als CP1252 an den Drucker.
  const buffer = toCp1252(sanitizeForPrint(content));
  console.log(`[Drucker] printRaw: ${buffer.length} Bytes, Drucker="${printerName}"`);

  if (buffer.length === 0) {
    console.error('[Drucker] Inhalt ist leer - nichts zu drucken');
    return false;
  }

  const tmpFile = path.join(os.tmpdir(), `gastro-bon-${Date.now()}.bin`);
  fs.writeFileSync(tmpFile, buffer);

  try {
    const output = execSync(
      `powershell -NoProfile -ExecutionPolicy Bypass -File "${RAW_PRINT_SCRIPT}" -PrinterName "${printerName}" -FilePath "${tmpFile}"`,
      { encoding: 'utf-8', windowsHide: true, timeout: 10000 }
    );
    console.log(`[Drucker] ${output.trim()}`);
    fs.unlinkSync(tmpFile);
    return true;
  } catch (err) {
    const e = err as { stderr?: string; stdout?: string; message: string };
    const msg = e.stderr?.trim() || e.message;
    console.error('[Drucker] Fehler beim Drucken:', msg);
    console.error(`[Drucker] Datei bleibt zur Diagnose: ${tmpFile}`);
    return false;
  }
}

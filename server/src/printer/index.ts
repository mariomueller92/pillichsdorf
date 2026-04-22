import { config } from '../config.js';
import fs from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import os from 'os';

// ESC/POS command constants
const ESC = '\x1B';
const GS = '\x1D';
const COMMANDS = {
  INIT: ESC + '@',
  BOLD_ON: ESC + 'E\x01',
  BOLD_OFF: ESC + 'E\x00',
  ALIGN_CENTER: ESC + 'a\x01',
  ALIGN_LEFT: ESC + 'a\x00',
  FONT_NORMAL: ESC + '!\x00',
  FONT_DOUBLE_HEIGHT: ESC + '!\x10',
  CUT: GS + 'V\x00',
  FEED: '\n',
};

let enabled = false;
let printerName = '';

export function initPrinter(): boolean {
  enabled = config.printer.enabled;
  printerName = config.printer.name;

  if (!enabled) {
    console.log('[Drucker] Deaktiviert (PRINTER_ENABLED=false)');
    return false;
  }

  // Verify printer exists on Windows
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

export function isPrinterEnabled(): boolean {
  return enabled;
}

export function printRaw(content: string): boolean {
  if (!enabled) return false;

  const buffer = Buffer.from(content, 'binary');
  console.log(`[Drucker] printRaw: ${buffer.length} Bytes, Drucker="${printerName}"`);

  if (buffer.length === 0) {
    console.error('[Drucker] Inhalt ist leer - nichts zu drucken');
    return false;
  }

  const tmpFile = path.join(os.tmpdir(), `gastro-bon-${Date.now()}.bin`);
  fs.writeFileSync(tmpFile, buffer);

  try {
    execSync(`copy /b "${tmpFile}" "\\\\localhost\\${printerName}"`, {
      encoding: 'utf-8',
      windowsHide: true,
      timeout: 10000,
    });
    fs.unlinkSync(tmpFile);
    return true;
  } catch (err) {
    console.warn('[Drucker] copy /b fehlgeschlagen, versuche PowerShell-Fallback:', (err as Error).message);
    try {
      execSync(
        `powershell -Command "Get-Content -Path '${tmpFile}' -AsByteStream | Out-Printer -Name '${printerName}'"`,
        { encoding: 'utf-8', windowsHide: true, timeout: 10000 }
      );
      fs.unlinkSync(tmpFile);
      return true;
    } catch (err2) {
      console.error('[Drucker] Fehler beim Drucken:', err2);
      console.error(`[Drucker] Datei bleibt zur Diagnose: ${tmpFile}`);
      return false;
    }
  }
}

// Build a formatted ESC/POS receipt
export function buildReceipt(): ReceiptBuilder {
  return new ReceiptBuilder(config.printer.width);
}

export class ReceiptBuilder {
  private data = '';
  private width: number;

  constructor(width: number) {
    this.width = width;
    this.data = COMMANDS.INIT;
  }

  center(): this { this.data += COMMANDS.ALIGN_CENTER; return this; }
  left(): this { this.data += COMMANDS.ALIGN_LEFT; return this; }
  bold(on: boolean): this { this.data += on ? COMMANDS.BOLD_ON : COMMANDS.BOLD_OFF; return this; }
  big(on: boolean): this { this.data += on ? COMMANDS.FONT_DOUBLE_HEIGHT : COMMANDS.FONT_NORMAL; return this; }

  line(text: string = ''): this {
    this.data += text + COMMANDS.FEED;
    return this;
  }

  separator(char: string = '-'): this {
    this.data += char.repeat(this.width) + COMMANDS.FEED;
    return this;
  }

  row(left: string, right: string): this {
    const pad = this.width - left.length - right.length;
    this.data += left + ' '.repeat(Math.max(1, pad)) + right + COMMANDS.FEED;
    return this;
  }

  feed(lines: number = 1): this {
    for (let i = 0; i < lines; i++) this.data += COMMANDS.FEED;
    return this;
  }

  cut(): this { this.data += COMMANDS.FEED + COMMANDS.FEED + COMMANDS.CUT; return this; }

  toString(): string { return this.data; }
}

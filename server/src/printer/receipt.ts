// ESC/POS-Bon-Inhalt bauen — reines String-/Buffer-Handling, keine Prozess-/Dateisystem-
// Abhängigkeiten. Läuft in der Vercel-Function; die eigentliche Druckausführung
// (execSync/PowerShell) übernimmt der lokale Print-Agent (server/src/print-agent/agent.ts).

const ESC = '\x1B';
const GS = '\x1D';
const COMMANDS = {
  INIT: ESC + '@',
  // Select character code table: 16 = WPC1252 (Windows Latin-1) - supports ae/oe/ue/ss
  CODEPAGE_CP1252: ESC + 't' + '\x10',
  // International charset 2 = German (ensures correct umlaut glyph mapping on older ESC/POS)
  CHARSET_GERMAN: ESC + 'R' + '\x02',
  BOLD_ON: ESC + 'E\x01',
  BOLD_OFF: ESC + 'E\x00',
  ALIGN_CENTER: ESC + 'a\x01',
  ALIGN_LEFT: ESC + 'a\x00',
  FONT_NORMAL: ESC + '!\x00',
  FONT_DOUBLE_HEIGHT: ESC + '!\x10',
  FONT_DOUBLE_WIDTH: ESC + '!\x20',
  FONT_DOUBLE_BOTH: ESC + '!\x30',
  FONT_QUAD: ESC + '!\x38', // double width + double height + bold (big table number)
  CUT: GS + 'V\x00',
  FEED: '\n',
};

// Transliterate all non-ASCII glyphs to plain ASCII equivalents for the thermal printer.
// Der Bondrucker des Kunden stellt Umlaute/Akzente nicht zuverlässig dar — also
// ersetzen wir sie hart durch ae/oe/ue/ss bzw. Grundbuchstaben.
export function sanitizeForPrint(text: string): string {
  const map: Record<string, string> = {
    'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'ß': 'ss',
    'Ä': 'Ae', 'Ö': 'Oe', 'Ü': 'Ue',
    'á': 'a', 'à': 'a', 'â': 'a', 'ã': 'a', 'å': 'a',
    'Á': 'A', 'À': 'A', 'Â': 'A', 'Ã': 'A', 'Å': 'A',
    'é': 'e', 'è': 'e', 'ê': 'e', 'ë': 'e',
    'É': 'E', 'È': 'E', 'Ê': 'E', 'Ë': 'E',
    'í': 'i', 'ì': 'i', 'î': 'i', 'ï': 'i',
    'Í': 'I', 'Ì': 'I', 'Î': 'I', 'Ï': 'I',
    'ó': 'o', 'ò': 'o', 'ô': 'o', 'õ': 'o',
    'Ó': 'O', 'Ò': 'O', 'Ô': 'O', 'Õ': 'O',
    'ú': 'u', 'ù': 'u', 'û': 'u',
    'Ú': 'U', 'Ù': 'U', 'Û': 'U',
    'ñ': 'n', 'Ñ': 'N',
    'ç': 'c', 'Ç': 'C',
    '–': '-', '—': '-', '…': '...',
    '„': '"', '“': '"', '”': '"', '‚': "'", '‘': "'", '’': "'",
  };
  return text.replace(/[^\x00-\x7F]/g, ch => map[ch] ?? ch);
}

// Map ASCII-sanitized string to CP1252 bytes. (Nach sanitizeForPrint sollte hier
// eigentlich nur noch ASCII ankommen — CP1252-Mapping bleibt als Sicherheitsnetz.)
export function toCp1252(text: string): Buffer {
  const bytes: number[] = [];
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    // ASCII passthrough
    if (code < 0x80) { bytes.push(code); continue; }
    // Latin-1 block maps 1:1 to CP1252 positions 0xA0-0xFF
    if (code >= 0xA0 && code <= 0xFF) { bytes.push(code); continue; }
    // Specific CP1252-only glyphs (0x80-0x9F block)
    const cp1252Extra: Record<number, number> = {
      0x20AC: 0x80, // €
      0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85,
      0x2020: 0x86, 0x2021: 0x87, 0x02C6: 0x88, 0x2030: 0x89,
      0x0160: 0x8A, 0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E,
      0x2018: 0x91, 0x2019: 0x92, 0x201C: 0x93, 0x201D: 0x94,
      0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02DC: 0x98,
      0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B, 0x0153: 0x9C,
      0x017E: 0x9E, 0x0178: 0x9F,
    };
    if (cp1252Extra[code] !== undefined) { bytes.push(cp1252Extra[code]); continue; }
    // Fallback: replace unknown chars
    bytes.push(0x3F); // '?'
  }
  return Buffer.from(bytes);
}

export function buildReceipt(width: number): ReceiptBuilder {
  return new ReceiptBuilder(width);
}

export class ReceiptBuilder {
  private data = '';
  private width: number;

  constructor(width: number) {
    this.width = width;
    // Init + select Windows-1252 codepage + German international charset
    this.data = COMMANDS.INIT + COMMANDS.CODEPAGE_CP1252 + COMMANDS.CHARSET_GERMAN;
  }

  center(): this { this.data += COMMANDS.ALIGN_CENTER; return this; }
  left(): this { this.data += COMMANDS.ALIGN_LEFT; return this; }
  bold(on: boolean): this { this.data += on ? COMMANDS.BOLD_ON : COMMANDS.BOLD_OFF; return this; }
  big(on: boolean): this { this.data += on ? COMMANDS.FONT_DOUBLE_HEIGHT : COMMANDS.FONT_NORMAL; return this; }
  doubleWidth(on: boolean): this { this.data += on ? COMMANDS.FONT_DOUBLE_WIDTH : COMMANDS.FONT_NORMAL; return this; }
  huge(on: boolean): this { this.data += on ? COMMANDS.FONT_DOUBLE_BOTH : COMMANDS.FONT_NORMAL; return this; }
  quad(on: boolean): this { this.data += on ? COMMANDS.FONT_QUAD : COMMANDS.FONT_NORMAL; return this; }

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

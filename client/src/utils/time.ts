// SQLite datetime('now') returns 'YYYY-MM-DD HH:MM:SS' in UTC without timezone.
// Default Date parsing treats that format as local time, shifting display and runtime calculations by the local UTC offset.
export function parseDbTime(s: string | null | undefined): Date {
  if (!s) return new Date(NaN);
  if (s.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(s)) return new Date(s);
  return new Date(s.replace(' ', 'T') + 'Z');
}

export function formatDbTimeHM(s: string | null | undefined): string {
  const d = parseDbTime(s);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

export function minutesSince(s: string | null | undefined, now: number = Date.now()): number {
  const d = parseDbTime(s);
  if (isNaN(d.getTime())) return 0;
  return Math.floor((now - d.getTime()) / 60000);
}

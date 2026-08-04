import { queryOne, execute } from '../database.js';
import { Settings } from '../shared/types.js';

export async function getSettings(): Promise<Settings> {
  const settings = await queryOne<Settings>('SELECT * FROM settings WHERE id = 1');
  return settings!;
}

export async function updateSettings(data: Partial<Omit<Settings, 'id' | 'updated_at'>>): Promise<Settings> {
  const updates: string[] = [];
  const values: any[] = [];

  if (data.company_name !== undefined) { updates.push('company_name = ?'); values.push(data.company_name); }
  if (data.company_address1 !== undefined) { updates.push('company_address1 = ?'); values.push(data.company_address1); }
  if (data.company_address2 !== undefined) { updates.push('company_address2 = ?'); values.push(data.company_address2); }
  if (data.company_betriebsnummer !== undefined) { updates.push('company_betriebsnummer = ?'); values.push(data.company_betriebsnummer); }
  if (data.company_footer !== undefined) { updates.push('company_footer = ?'); values.push(data.company_footer); }
  if (data.printer_name !== undefined) { updates.push('printer_name = ?'); values.push(data.printer_name); }
  if (data.printer_width !== undefined) { updates.push('printer_width = ?'); values.push(data.printer_width); }

  if (updates.length > 0) {
    updates.push('updated_at = now()');
    await execute(`UPDATE settings SET ${updates.join(', ')} WHERE id = 1`, values);
  }
  return getSettings();
}

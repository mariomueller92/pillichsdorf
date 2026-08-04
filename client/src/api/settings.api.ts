import api from './client';
import { Settings } from '@/types';

export async function getSettings(): Promise<Settings> {
  const { data } = await api.get<Settings>('/settings');
  return data;
}

export async function updateSettings(body: Partial<Omit<Settings, 'id' | 'updated_at'>>): Promise<Settings> {
  const { data } = await api.put<Settings>('/settings', body);
  return data;
}

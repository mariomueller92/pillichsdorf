import api from './client';
import { JetonType } from '@/types';

export async function getJetonTypes(): Promise<JetonType[]> {
  const { data } = await api.get<JetonType[]>('/jeton-types');
  return data;
}

export async function createJetonType(body: { name: string; color: string; value: number; sort_order: number }): Promise<JetonType> {
  const { data } = await api.post<JetonType>('/jeton-types', body);
  return data;
}

export async function updateJetonType(id: number, body: Partial<JetonType>): Promise<JetonType> {
  const { data } = await api.put<JetonType>(`/jeton-types/${id}`, body);
  return data;
}

export async function deleteJetonType(id: number): Promise<void> {
  await api.delete(`/jeton-types/${id}`);
}

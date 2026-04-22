import api from './client';
import { Table } from '@/types';

export async function getTables(): Promise<Table[]> {
  const { data } = await api.get<Table[]>('/tables');
  return data;
}

export async function getTable(id: number): Promise<any> {
  const { data } = await api.get(`/tables/${id}`);
  return data;
}

export async function createTable(body: { table_number: string; capacity?: number | null }): Promise<Table> {
  const { data } = await api.post<Table>('/tables', body);
  return data;
}

export async function updateTable(id: number, body: Partial<Table>): Promise<Table> {
  const { data } = await api.put<Table>(`/tables/${id}`, body);
  return data;
}

export async function deleteTable(id: number): Promise<void> {
  await api.delete(`/tables/${id}`);
}

export async function mergeTables(primaryTableId: number, secondaryTableIds: number[]): Promise<void> {
  await api.post('/tables/merge', { primary_table_id: primaryTableId, secondary_table_ids: secondaryTableIds });
}

export async function unmergeTables(tableId: number): Promise<void> {
  await api.post('/tables/unmerge', { table_id: tableId });
}

export async function releaseTable(tableId: number): Promise<Table> {
  const { data } = await api.post<Table>(`/tables/${tableId}/release`);
  return data;
}

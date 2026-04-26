import api from './client';
import { MenuItem } from '@/types';

export async function getPendingKitchenItems(): Promise<any[]> {
  const { data } = await api.get('/orders/pending-kitchen');
  return data;
}

export async function getTopItems(limit: number = 10): Promise<Array<{
  menu_item_id: number;
  item_name: string;
  category_name: string;
  total_quantity: number;
  order_count: number;
}>> {
  const { data } = await api.get('/orders/top-items', { params: { limit } });
  return data;
}

export async function toggleItemMode(itemId: number): Promise<MenuItem> {
  const { data } = await api.patch<MenuItem>(`/menu/items/${itemId}/mode`);
  return data;
}

export async function moveBarToTable(orderId: number, targetTableId: number): Promise<any> {
  const { data } = await api.post(`/orders/${orderId}/move-to-table`, { target_table_id: targetTableId });
  return data;
}

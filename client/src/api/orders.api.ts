import api from './client';
import { Order } from '@/types';

export async function getOrders(filters?: { table_id?: number; status?: string }): Promise<any[]> {
  const { data } = await api.get('/orders', { params: filters });
  return data;
}

export async function getAllOrdersAdmin(filters?: { from?: string; to?: string }): Promise<any[]> {
  const { data } = await api.get('/orders/admin/all', { params: filters });
  return data;
}

export async function getActiveOrders(target?: string): Promise<Order[]> {
  const { data } = await api.get<Order[]>('/orders/active', { params: target ? { target } : {} });
  return data;
}

export async function getOrder(id: number): Promise<Order> {
  const { data } = await api.get<Order>(`/orders/${id}`);
  return data;
}

export async function createOrder(body: {
  table_id: number | null;
  notes?: string | null;
  items: Array<{ menu_item_id: number; quantity: number; notes?: string | null }>;
}): Promise<Order> {
  const { data } = await api.post<Order>('/orders', body);
  return data;
}

export async function addOrderItems(orderId: number, items: Array<{ menu_item_id: number; quantity: number; notes?: string | null }>): Promise<Order> {
  const { data } = await api.post<Order>(`/orders/${orderId}/items`, { items });
  return data;
}

export async function acknowledgeOrder(orderId: number, itemIds: number[], status: string): Promise<Order> {
  const { data } = await api.post<Order>(`/orders/${orderId}/acknowledge`, { item_ids: itemIds, status });
  return data;
}

export async function markItemServed(orderId: number, itemId: number): Promise<Order> {
  const { data } = await api.patch<Order>(`/orders/${orderId}/items/${itemId}`, { status: 'serviert' });
  return data;
}

export async function updateItemStatus(orderId: number, itemId: number, status: string): Promise<Order> {
  const { data } = await api.patch<Order>(`/orders/${orderId}/items/${itemId}`, { status });
  return data;
}

export async function cancelOrder(id: number): Promise<Order> {
  const { data } = await api.delete<Order>(`/orders/${id}`);
  return data;
}

export async function transferOrder(orderId: number, targetTableId: number): Promise<Order> {
  const { data } = await api.post<Order>(`/orders/${orderId}/transfer`, { target_table_id: targetTableId });
  return data;
}

export async function reprintOrderBon(orderId: number): Promise<{ printed: boolean; orderId: number }> {
  const { data } = await api.post(`/orders/${orderId}/reprint-bon`);
  return data;
}

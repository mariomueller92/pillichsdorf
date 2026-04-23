import api from './client';

export async function getTableSummary(tableId: number): Promise<any> {
  const { data } = await api.get(`/billing/table/${tableId}/summary`);
  return data;
}

export async function printBill(tableId: number): Promise<any> {
  const { data } = await api.post(`/billing/table/${tableId}/print-bill`);
  return data;
}

export async function settleTable(tableId: number, body: {
  discount_type?: string | null;
  discount_value?: number;
  notes?: string | null;
  print_bon?: boolean;
}): Promise<any> {
  const { data } = await api.post(`/billing/table/${tableId}/settle`, body);
  return data;
}

export async function getOrderSummary(orderId: number): Promise<any> {
  const { data } = await api.get(`/billing/order/${orderId}/summary`);
  return data;
}

export async function settleOrder(orderId: number, body: {
  discount_type?: string | null;
  discount_value?: number;
  notes?: string | null;
  print_bon?: boolean;
}): Promise<any> {
  const { data } = await api.post(`/billing/order/${orderId}/settle`, body);
  return data;
}


export async function settleItems(body: {
  table_id: number;
  order_item_ids: number[];
  discount_type?: string | null;
  discount_value?: number;
  notes?: string | null;
  print_bon?: boolean;
}): Promise<any> {
  const { data } = await api.post('/billing/settle-items', body);
  return data;
}

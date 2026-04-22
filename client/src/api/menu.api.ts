import api from './client';
import { MenuCategory, MenuItem } from '@/types';

export async function getCategories(): Promise<MenuCategory[]> {
  const { data } = await api.get<MenuCategory[]>('/menu/categories');
  return data;
}

export async function createCategory(body: { name: string; sort_order: number; target: string }): Promise<MenuCategory> {
  const { data } = await api.post<MenuCategory>('/menu/categories', body);
  return data;
}

export async function updateCategory(id: number, body: Partial<MenuCategory>): Promise<MenuCategory> {
  const { data } = await api.put<MenuCategory>(`/menu/categories/${id}`, body);
  return data;
}

export async function deleteCategory(id: number): Promise<void> {
  await api.delete(`/menu/categories/${id}`);
}

export async function getItems(categoryId?: number): Promise<MenuItem[]> {
  const params = categoryId ? { category_id: categoryId } : {};
  const { data } = await api.get<MenuItem[]>('/menu/items', { params });
  return data;
}

export async function createItem(body: { category_id: number; name: string; price: number; sort_order: number }): Promise<MenuItem> {
  const { data } = await api.post<MenuItem>('/menu/items', body);
  return data;
}

export async function updateItem(id: number, body: Partial<MenuItem>): Promise<MenuItem> {
  const { data } = await api.put<MenuItem>(`/menu/items/${id}`, body);
  return data;
}

export async function deleteItem(id: number): Promise<void> {
  await api.delete(`/menu/items/${id}`);
}

export async function toggleAvailability(id: number): Promise<MenuItem> {
  const { data } = await api.patch<MenuItem>(`/menu/items/${id}/availability`);
  return data;
}

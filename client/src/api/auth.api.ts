import api from './client';
import { AuthResponse, User } from '@/types';

export async function loginWithCredentials(username: string, password: string): Promise<AuthResponse> {
  const { data } = await api.post<AuthResponse>('/auth/login', { username, password });
  return data;
}

export async function loginWithPin(pin: string): Promise<AuthResponse> {
  const { data } = await api.post<AuthResponse>('/auth/login-pin', { pin });
  return data;
}

export async function getMe(): Promise<User> {
  const { data } = await api.get<User>('/auth/me');
  return data;
}

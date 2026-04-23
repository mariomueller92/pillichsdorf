import axios, { AxiosError } from 'axios';
import { useUIStore } from '@/stores/uiStore';

const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
});

// Offline queue for critical operations
const QUEUE_KEY = 'offline_queue';

interface QueuedRequest {
  method: string;
  url: string;
  data?: any;
  timestamp: number;
  token?: string; // Token des Users der den Request abgeschickt hat
}

function getQueue(): QueuedRequest[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  } catch { return []; }
}

function addToQueue(req: QueuedRequest): void {
  const queue = getQueue();
  queue.push(req);
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

function clearQueue(): void {
  localStorage.removeItem(QUEUE_KEY);
}

// Replay queued requests when back online
export async function replayQueue(): Promise<void> {
  const queue = getQueue();
  if (queue.length === 0) return;

  console.log(`[Offline] Sende ${queue.length} gespeicherte Anfragen...`);
  clearQueue();

  const currentToken = localStorage.getItem('token') || undefined;
  for (const req of queue) {
    // Wichtig: verwende den Token, mit dem der Request ursprünglich abgeschickt wurde,
    // damit offline-gequeuete Bestellungen dem richtigen Kellner zugeordnet werden
    // (und nicht dem aktuell eingeloggten User).
    const headers: Record<string, string> = {};
    const tokenToUse = req.token || currentToken;
    if (tokenToUse) headers.Authorization = `Bearer ${tokenToUse}`;
    try {
      await api.request({ method: req.method, url: req.url, data: req.data, headers });
      console.log(`[Offline] Gesendet: ${req.method} ${req.url}`);
    } catch (err) {
      console.error(`[Offline] Fehlgeschlagen: ${req.method} ${req.url}`, err);
    }
  }
}

// Auth token interceptor
api.interceptors.request.use((config) => {
  // Falls ein Authorization-Header bereits explizit gesetzt wurde (z.B. Replay mit
  // gespeichertem Token), NICHT mit dem aktuell eingeloggten Token überschreiben.
  if (config.headers?.Authorization) return config;
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor: retry + offline queue
api.interceptors.response.use(
  (response) => {
    // We're online
    useUIStore.getState().setOffline(false);
    return response;
  },
  async (error: AxiosError) => {
    const config = error.config;
    if (!config) return Promise.reject(error);

    // Auth error - redirect to login
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
      return Promise.reject(error);
    }

    // Network error (offline) or timeout
    if (!error.response && (error.code === 'ERR_NETWORK' || error.code === 'ECONNABORTED')) {
      useUIStore.getState().setOffline(true);

      // Retry up to 2 times with backoff
      const retryCount = (config as any).__retryCount || 0;
      if (retryCount < 2) {
        (config as any).__retryCount = retryCount + 1;
        const delay = Math.pow(2, retryCount) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
        return api.request(config);
      }

      // After retries fail, queue critical POST requests
      if (config.method === 'post' && config.url) {
        addToQueue({
          method: config.method,
          url: config.url,
          data: config.data ? JSON.parse(config.data as string) : undefined,
          timestamp: Date.now(),
          token: localStorage.getItem('token') || undefined,
        });
        console.log(`[Offline] Gespeichert: POST ${config.url}`);
      }
    }

    return Promise.reject(error);
  }
);

export default api;

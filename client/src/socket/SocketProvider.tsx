import { useEffect } from 'react';
import { connectSocket, disconnectSocket, getSocket } from './socket';
import { useTablesStore } from '@/stores/tablesStore';
import { useOrdersStore } from '@/stores/ordersStore';
import { useMenuStore } from '@/stores/menuStore';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { replayQueue } from '@/api/client';
import { Howl } from 'howler';
import { toast } from 'sonner';

const notificationSound = new Howl({
  src: ['/sounds/notification.mp3'],
  volume: 0.8,
});

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);

  useEffect(() => {
    if (!isAuthenticated) return;

    connectSocket();
    const socket = getSocket();

    socket.on('order:new', (data) => {
      // Refresh active orders
      useOrdersStore.getState().fetchActiveOrders();
      // Play sound if enabled
      if (useUIStore.getState().soundEnabled) {
        notificationSound.play();
      }
    });

    socket.on('order:updated', () => {
      useOrdersStore.getState().fetchActiveOrders();
    });

    socket.on('order:cancelled', (data) => {
      useOrdersStore.getState().removeOrderFromList(data.orderId);
    });

    socket.on('order:item_ready', () => {
      useOrdersStore.getState().fetchActiveOrders();
      if (useUIStore.getState().soundEnabled) {
        notificationSound.play();
      }
    });

    socket.on('table:status_changed', (data) => {
      useTablesStore.getState().updateTableLocal(data.tableId, { status: data.status });
    });

    socket.on('table:merged', () => {
      useTablesStore.getState().fetchTables();
    });

    socket.on('bill:settled', () => {
      useTablesStore.getState().fetchTables();
      useOrdersStore.getState().fetchActiveOrders();
    });

    socket.on('product:availability_changed', () => {
      useMenuStore.getState().fetchMenu();
    });

    socket.on('order:moved_to_table', () => {
      useTablesStore.getState().fetchTables();
    });

    socket.on('printer:error', (data: { message: string }) => {
      toast.error(`Drucker: ${data.message || 'Fehler oder offline'}`, {
        duration: 10000,
        description: 'Bitte Drucker prüfen (Papier, Verbindung, eingeschaltet).',
      });
    });

    socket.on('connect', () => {
      // We're back online
      useUIStore.getState().setOffline(false);
      // Re-fetch state on reconnect
      useTablesStore.getState().fetchTables();
      useMenuStore.getState().fetchMenu();
      useOrdersStore.getState().fetchActiveOrders();
      // Replay queued offline requests
      replayQueue();
    });

    socket.on('disconnect', () => {
      useUIStore.getState().setOffline(true);
    });

    return () => {
      disconnectSocket();
    };
  }, [isAuthenticated]);

  return <>{children}</>;
}

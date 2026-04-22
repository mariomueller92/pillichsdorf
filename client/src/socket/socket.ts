import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io({
      auth: { token: localStorage.getItem('token') },
      autoConnect: false,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: Infinity,
    });
  }
  return socket;
}

export function connectSocket(): void {
  const s = getSocket();
  s.auth = { token: localStorage.getItem('token') };
  s.connect();
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}

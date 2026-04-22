import { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { JwtPayload } from '../shared/types.js';

let io: Server;

export function setupSocket(server: HttpServer): Server {
  io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  // JWT auth middleware for socket connections
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Nicht authentifiziert'));
    }
    try {
      const payload = jwt.verify(token, config.jwtSecret) as JwtPayload;
      socket.data.user = payload;
      next();
    } catch {
      next(new Error('Token ungueltig'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user as JwtPayload;
    console.log(`[Socket] ${user.displayName} verbunden (${user.role})`);

    // Join role-based rooms
    if (user.role === 'kueche_schank') {
      socket.join('kueche');
      socket.join('schank');
    }
    if (user.role === 'kellner' || user.role === 'admin') {
      socket.join(`kellner:${user.userId}`);
    }
    if (user.role === 'admin') {
      socket.join('admin');
      socket.join('kueche');
      socket.join('schank');
    }

    // Join table-specific room
    socket.on('join:table', (tableId: number) => {
      socket.join(`tisch:${tableId}`);
    });

    socket.on('leave:table', (tableId: number) => {
      socket.leave(`tisch:${tableId}`);
    });

    socket.on('disconnect', () => {
      console.log(`[Socket] ${user.displayName} getrennt`);
    });
  });

  return io;
}

export function getIo(): Server {
  return io;
}

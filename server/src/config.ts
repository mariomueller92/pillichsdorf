import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  jwtSecret: process.env.JWT_SECRET || 'change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  dbPath: process.env.DB_PATH || path.resolve(__dirname, '../data/pillichsdorf.db'),
  printer: {
    enabled: process.env.PRINTER_ENABLED === 'true',
    name: process.env.PRINTER_NAME || 'Knub Thermica',
    width: parseInt(process.env.PRINTER_WIDTH || '32', 10),
  },
  logLevel: process.env.LOG_LEVEL || 'info',
};

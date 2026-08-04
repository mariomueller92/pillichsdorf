import { Request, Response, NextFunction } from 'express';
import { config } from '../config.js';

// Maschinen-Auth für den lokalen Print-Agent — bewusst getrennt vom User-JWT (auth.ts),
// da der Agent kein Benutzerkonto ist, sondern ein dauerhaft laufender Poller.
export function printAgentAuth(req: Request, res: Response, next: NextFunction): void {
  const token = req.headers['x-print-agent-token'];
  if (token !== config.printAgentToken) {
    res.status(401).json({ error: 'Nicht authentifiziert' });
    return;
  }
  next();
}

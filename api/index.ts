// Vercel-Serverless-Function-Einstieg. Exportiert nur die Express-App (Routen +
// Middleware aus server/src/app.ts) — kein server.listen(), keine Boot-Migrationen
// (die laufen separat vor dem Deploy via `cd server && npm run migrate`, siehe
// package.json "vercel-build" bzw. manuell gegen die Neon-DB).
import { app } from '../server/src/app.js';

export default app;

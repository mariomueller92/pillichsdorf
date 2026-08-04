// Lokaler Dev-/Prod-Entry-Point (npm run dev / npm start). Auf Vercel importiert
// api/index.ts stattdessen nur `app` aus app.ts — hier laeuft zusaetzlich der
// lange laufende HTTP-Listener plus Boot-Migrationen, die eine Serverless-Function
// nicht bei jedem Cold-Start wiederholen soll (siehe `npm run migrate` fuer Vercel-Deploys).
import { createServer } from 'http';
import { config } from './config.js';
import { runMigrations, seedDefaultData } from './database.js';
import { app } from './app.js';

const server = createServer(app);

async function start() {
  await runMigrations();
  await seedDefaultData();

  server.listen(config.port, config.host, () => {
    console.log(`[Server] Laeuft auf http://${config.host}:${config.port}`);
  });
}

start().catch(console.error);

export { app, server };

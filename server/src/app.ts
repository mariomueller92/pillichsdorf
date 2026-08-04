import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { errorHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/auth.routes.js';
import usersRoutes from './routes/users.routes.js';
import menuRoutes from './routes/menu.routes.js';
import tablesRoutes from './routes/tables.routes.js';
import ordersRoutes from './routes/orders.routes.js';
import billingRoutes from './routes/billing.routes.js';
import statsRoutes from './routes/stats.routes.js';
import jetonTypesRoutes from './routes/jetonTypes.routes.js';
import settingsRoutes from './routes/settings.routes.js';
import printJobsRoutes from './routes/printJobs.routes.js';
import { getSettings } from './services/settings.service.js';

export const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/tables', tablesRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/jeton-types', jetonTypesRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/print-jobs', printJobsRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve client in production (only if build exists) — auf Vercel uebernimmt das
// stattdessen die statische Auslieferung/SPA-Rewrite aus vercel.json.
const clientDist = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
} else {
  app.get('*', async (_req, res) => {
    const companyName = (await getSettings()).company_name;
    res.status(200).send(
      '<html><body style="font-family:sans-serif;text-align:center;padding:60px">' +
      `<h2>${companyName} - Backend laeuft</h2>` +
      '<p>Frontend noch nicht gebaut. Entweder:</p>' +
      '<ul style="list-style:none"><li><b>Dev-Modus:</b> Oeffne <a href="http://localhost:5173">http://localhost:5173</a></li>' +
      '<li><b>Produktion:</b> Fuehre <code>cd client && npm run build</code> aus</li></ul>' +
      '</body></html>'
    );
  });
}

// Error handler
app.use(errorHandler);

import { domainStats } from '../db/db.js';

export async function registerStatsRoutes(app) {
  app.get('/api/stats', async () => {
    return domainStats();
  });
}
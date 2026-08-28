import { listDomains } from '../db/db.js';

export async function registerDomainRoutes(app) {
  app.get('/api/domains', async () => {
    return { domains: listDomains() };
  });
}
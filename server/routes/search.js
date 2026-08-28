import { searchPages } from '../search/index.js';

export async function registerSearchRoutes(app) {
  app.get('/api/search', async (req, reply) => {
    const q = String(req.query?.q || '').trim();
    const limit = Math.min(50, Number(req.query?.limit) || 20);
    if (!q) {
      return reply.send({ query: q, results: [] });
    }
    const results = searchPages(q, limit);
    return reply.send({ query: q, count: results.length, results });
  });
}
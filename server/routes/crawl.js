import { enqueueUrl, getDomainFromUrl, normalizeUrl } from '../db/db.js';

export async function registerCrawlRoutes(app) {
  app.post('/api/crawl', async (req, reply) => {
    const raw = req.body?.url;
    const priority = Number(req.body?.priority) || 0.5;
    const url = normalizeUrl(raw);
    if (!url) {
      return reply.code(400).send({ error: 'Neplatna URL' });
    }
    const domain = getDomainFromUrl(url);
    const item = enqueueUrl(url, domain, 'user_input', Math.min(1, Math.max(0.1, priority)));
    return reply.send({ ok: true, item });
  });
}

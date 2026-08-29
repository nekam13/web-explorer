import { searchPages, tokenizeCzech } from '../search/index.js';
import { db } from '../db/db.js';

function normalizeForSuggest(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export async function registerSearchRoutes(app) {
  app.get('/api/search/suggest', async (req, reply) => {
    const q = String(req.query?.q || '').trim().toLowerCase();
    if (!q) return reply.send({ query: q, suggestions: [] });
    const needle = normalizeForSuggest(q);
    const rows = db.prepare(
      "SELECT DISTINCT title FROM pages WHERE title IS NOT NULL AND title != '' ORDER BY word_count DESC, last_crawled DESC LIMIT 400"
    ).all();
    const seen = new Set();
    const suggestions = rows.map(r => r.title).filter(t => {
      const key = normalizeForSuggest(t);
      if (seen.has(key)) return false;
      seen.add(key);
      return key.includes(needle);
    }).slice(0, 10);
    return reply.send({ query: q, suggestions });
  });
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
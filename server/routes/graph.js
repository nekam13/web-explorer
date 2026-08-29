import { db } from '../db/db.js';

export async function registerGraphRoutes(app) {
  app.get('/api/graph', async () => {
    const nodes = db.prepare(
      `SELECT url, title, domain, word_count FROM pages WHERE url IN (SELECT source_url FROM links_graph WHERE link_type = 'internal' UNION SELECT target_url FROM links_graph WHERE link_type = 'internal')`
    ).all();
    const links = db.prepare(
      `SELECT source_url, target_url, link_type, anchor_text, weight FROM links_graph WHERE link_type = 'internal' AND source_url IN (SELECT url FROM pages) AND target_url IN (SELECT url FROM pages) LIMIT 500`
    ).all();
    return {
      nodes: nodes.map(n => ({
        id: n.url,
        label: n.url,
        url: n.url,
        domain: n.domain || null,
        title: n.title || n.url,
        wordCount: n.word_count || 0,
      })),
      links,
    };
  });
}
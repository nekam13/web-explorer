import { db } from '../db/db.js';

export async function registerGraphRoutes(app) {
  app.get('/api/graph', async () => {
    const nodes = db.prepare(
      "SELECT DISTINCT source_url AS url FROM links_graph UNION SELECT DISTINCT target_url AS url FROM links_graph WHERE link_type = 'internal'"
    ).all();
    const links = db.prepare(
      "SELECT source_url, target_url, link_type, anchor_text, weight FROM links_graph WHERE link_type = 'internal' LIMIT 500"
    ).all();
    return { nodes: nodes.map(n => ({ id: n.url, label: n.url })), links };
  });
}
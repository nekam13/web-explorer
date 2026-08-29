import { db } from '../db/db.js';

// Export dat: pages/domains/graph ve formatech JSON a CSV/GEXF.
// Bezstavové: data se generuji na vyžádání přímo z SQLite.

const CSV_HEADERS_PAGES ='id,url,domain,title,description,word_count,last_crawled,next_crawl';
const CSV_HEADERS_DOMAINS ='domain,status,crawl_allowed,crawl_delay,last_crawled,pages';

function csvEscape(v) {
  const s = String(v == null ? '' : v);
  if (/[",\n\r]/ .test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function toCSV(headers, rows) {
  const lines = [headers];
  for (const row of rows) {
    const vals = headers.split(',').map(h => csvEscape(row[h]));
    lines.push(vals.join(','));
  }
  return lines.join('\n');
}

function sendFile(reply, filename, content, type) {
  return reply.header('Content-Disposition', `attachment; filename="${filename}"`)
    .header('Content-Type', type)
    .send(content);
}

export async function registerExportRoutes(app) {
  app.get('/api/export/pages.json', async (req, reply) => {
    const rows = db.prepare("SELECT id, url, domain, title, description, word_count, last_crawled, next_crawl FROM pages ORDER BY last_crawled DESC").all();
    return sendFile(reply, 'pages.json', JSON.stringify(rows, null, 2), 'application/json');
  });

  app.get('/api/export/domains.json', async (req, reply) => {
    const rows = db.prepare("SELECT domain, status, crawl_allowed, crawl_delay, last_crawled FROM domains ORDER BY domain").all();
    const withPages = rows.map(d => ({ ...d, pages: db.prepare("SELECT COUNT(*) AS c FROM pages WHERE domain = ?").get(d.domain).c }));
    return sendFile(reply, 'domains.json', JSON.stringify(withPages, null, 2), 'application/json');
  });

  app.get('/api/export/pages.csv', async (req, reply) => {
    const rows = db.prepare("SELECT id, url, domain, title, description, word_count, last_crawled, next_crawl FROM pages ORDER BY last_crawled DESC").all();
    return sendFile(reply, 'pages.csv', toCSV(CSV_HEADERS_PAGES, rows), 'text/csv; charset=utf-8');
  });

  app.get('/api/export/domains.csv', async (req, reply) => {
    const rows = db.prepare("SELECT domain, status, crawl_allowed, crawl_delay, last_crawled FROM domains ORDER BY domain").all();
    const withPages = rows.map(d => ({ ...d, pages: db.prepare("SELECT COUNT(*) AS c FROM pages WHERE domain = ?").get(d.domain).c }));
    return sendFile(reply, 'domains.csv', toCSV(CSV_HEADERS_DOMAINS, withPages), 'text/csv; charset=utf-8');
  });

  app.get('/api/export/graph.json', async (req, reply) => {
    const nodes = db.prepare("SELECT url, title, domain, word_count FROM pages").all();
    const links = db.prepare("SELECT source_url, target_url, anchor_text, weight FROM links_graph WHERE link_type = 'internal'").all();
    return sendFile(reply, 'graph.json', JSON.stringify({ nodes, links }, null, 2), 'application/json');
  });

  app.get('/api/export/graph.gexf', async (req, reply) => {
    const nodes = db.prepare("SELECT url, title, domain, word_count FROM pages").all();
    const links = db.prepare("SELECT source_url AS source, target_url AS target, weight FROM links_graph WHERE link_type = 'internal'").all();
    const index = new Map();
for (let i = 0; i < nodes.length; i++) index.set(nodes[i].url, i);
    const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const body = nodes.map(n => `  <node id="${esc(n.url)}" label="${esc(n.title || n.url)}">\n    <attvalues>\n      <attvalue for="domain" value="${esc(n.domain)}"/>\n      <attvalue for="words" value="${String(n.word_count || 0)}"/>\n    </attvalues>\n  </node>`).join('\n');
    const edgeXml = links.map(l => {
    const sid = index.get(l.source);
    const tid = index.get(l.target);
    return `  <edge id="${esc(`${sid}-${tid}`)}" source="${esc(sid)}" target="${esc(tid)}">`;
  }).join('\n');
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<gexf xmlns="http://gexf.net/1.2draft/v1.2" version="1.2">\n  <meta lastmodifieddate="${new Date().toISOString()}"><creator>CWE</creator></meta>\n  <graph mode="static" defaultedgetype="directed">\n    <attributes class="node" mode="static">\n      <attribute id="domain" title="Domain" type="string"/>\n      <attribute id="words" title="Word count" type="integer"/>\n    </attributes>\n    <nodes>\n${body}\n    </nodes>\n    <edges>\n${edgeXml}\n    </edges>\n  </graph>\n</gexf>\n`;
    return sendFile(reply, 'graph.gexf', xml, 'application/x-gexf');
  });
}
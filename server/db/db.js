import Database from 'better-sqlite3';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_DIR = process.env.DATA_DIR || join(__dirname, '..', '..', 'data');
const DB_PATH = join(DB_DIR, 'cwe.db');

export const DATA_DIR = DB_DIR;

mkdirSync(DB_DIR, { recursive: true });

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

export function getPageByUrl(url) {
    return db.prepare('SELECT * FROM pages WHERE url = ?').get(url) || null;
}

export function getPage(id) {
    return db.prepare('SELECT * FROM pages WHERE id = ?').get(id) || null;
}

export function upsertDomain(domain, fields = {}) {
    const existing = db.prepare('SELECT * FROM domains WHERE domain = ?').get(domain);
    if (existing) {
        const keys = Object.keys(fields);
        if (keys.length) {
            const sets = keys.map(k => `${k} = @${k}`).join(', ');
            db.prepare(`UPDATE domains SET ${sets} WHERE domain = @domain`).run({ ...fields, domain });
        }
        return db.prepare('SELECT * FROM domains WHERE domain = ?').get(domain);
    }
    db.prepare('INSERT INTO domains (domain) VALUES (?)').run(domain);
    const keys = Object.keys(fields);
    if (keys.length) {
        const sets = keys.map(k => `${k} = @${k}`).join(', ');
        db.prepare(`UPDATE domains SET ${sets} WHERE domain = @domain`).run({ ...fields, domain });
    }
    return db.prepare('SELECT * FROM domains WHERE domain = ?').get(domain);
}

export function getDomain(domain) {
    return db.prepare('SELECT * FROM domains WHERE domain = ?').get(domain) || null;
}

export function getDomainFromUrl(urlString) {
    try {
        const u = new URL(urlString);
        let host = u.host.toLowerCase();
        if (host.startsWith('www.')) host = host.slice(4);
        return host;
    } catch {
        return '';
    }
}

export function enqueueUrl(url, domain, source = 'user_input', priority = 0.5) {
    const existing = db.prepare('SELECT * FROM queue WHERE url = ? AND status IN (?, ?)').get(url, 'pending', 'processing');
    if (existing) return existing;
    const info = db.prepare(
        'INSERT INTO queue (url, domain, source, priority) VALUES (?, ?, ?, ?)'
    ).run(url, domain, source, priority);
    return db.prepare('SELECT * FROM queue WHERE id = ?').get(info.lastInsertRowid);
}

export function nextQueueItem() {
    return db.prepare(
        'SELECT * FROM queue WHERE status = ? ORDER BY priority DESC, id ASC LIMIT 1'
    ).get('pending') || null;
}

export function markQueueProcessing(id) {
    db.prepare('UPDATE queue SET status = ?, processed_at = unixepoch() WHERE id = ?').run('processing', id);
}

export function markQueueDone(id) {
    db.prepare('UPDATE queue SET status = ? WHERE id = ?').run('done', id);
}

export function markQueueFailed(id, message) {
    const item = db.prepare('SELECT * FROM queue WHERE id = ?').get(id);
    const retries = (item?.retry_count || 0);
    if (retries < 3) {
        db.prepare(
            'UPDATE queue SET status = ?, error_message = ?, retry_count = ?, processed_at = NULL WHERE id = ?'
        ).run('pending', message, retries + 1, id);
    } else {
        db.prepare('UPDATE queue SET status = ?, error_message = ? WHERE id = ?').run('failed', message, id);
    }
}

export function countQueued() {
    return db.prepare('SELECT COUNT(*) AS n FROM queue WHERE status = ?').get('pending').n;
}

export function domainStats() {
    return {
        domains: db.prepare('SELECT COUNT(*) AS n FROM domains').get().n,
        pages: db.prepare('SELECT COUNT(*) AS n FROM pages WHERE crawl_status = ?').get('indexed').n,
        queued: countQueued(),
        words: db.prepare('SELECT COALESCE(SUM(word_count), 0) AS n FROM pages').get().n,
        lastCrawl: db.prepare('SELECT MAX(last_crawled) AS n FROM pages').get().n || null,
        errors: db.prepare('SELECT COUNT(*) AS n FROM queue WHERE status = ?').get('failed').n,
    };
}

export function upsertPage(page) {
  const existing = getPageByUrl(page.url);
  if (existing) {
    db.prepare(
      `UPDATE pages SET title = @title, description = @description,
        content_text = @content_text, content_hash = @content_hash,
        og_data = @og_data, schema_org = @schema_org,
        headings = @headings, links_internal = @links_internal,
        links_external = @links_external, word_count = @word_count,
        crawl_depth = @crawl_depth, crawl_status = 'indexed',
        priority = @priority, last_modified = @last_modified,
        last_crawled = unixepoch(), next_crawl = @next_crawl
       WHERE id = @id`
    ).run(normalizePageRow(page, existing.id));
    return db.prepare('SELECT * FROM pages WHERE id = ?').get(existing.id);
  }
  const info = db.prepare(
    `INSERT INTO pages (url, domain, title, description, content_text, content_hash,
       og_data, schema_org, headings, links_internal, links_external, word_count,
       crawl_depth, crawl_status, priority, last_modified, last_crawled, next_crawl)
     VALUES (@url, @domain, @title, @description, @content_text, @content_hash,
       @og_data, @schema_org, @headings, @links_internal, @links_external, @word_count,
       @crawl_depth, 'indexed', @priority, @last_modified, unixepoch(), @next_crawl)`
  ).run(normalizePageRow(page));
  return db.prepare('SELECT * FROM pages WHERE id = ?').get(info.lastInsertRowid);
}

function normalizePageRow(page, id) {
  const p = page || {};
  const row = {
    url: p.url,
    domain: p.domain,
    title: p.title ?? null,
    description: p.description ?? null,
    content_text: p.contentText ?? null,
    content_hash: p.contentHash ?? null,
    og_data: toJson(p.ogData),
    schema_org:toJson(p.schemaOrg),
    headings:toJson(p.headings),
    links_internal:toJson(p.linksInternal),
    links_external:toJson(p.linksExternal),
    word_count: p.wordCount ?? null,
    crawl_depth: p.crawlDepth ?? null,
    crawl_status: p.crawlStatus ?? 'indexed',
    priority: p.priority ?? null,
    last_modified: p.lastModified ?? null,
    next_crawl: p.nextCrawl ?? null,
  };
  if (id != null) row.id = id;
  return row;
}

export function normalizeUrl(raw) {
  if (!raw) return null;
  let s = String(raw).trim();
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    u.hash = '';
    return u.href;
  } catch {
    return null;
  }
}

export function listQueue({ limit = 50 } = {}) {
  return db.prepare('SELECT * FROM queue ORDER BY id DESC LIMIT ?').all(limit);
}

export function logBlocked(url, domain, reason) {
  domain = domain || getDomainFromUrl(url);
  const existing = db.prepare('SELECT * FROM domains WHERE domain = ?').get(domain);
  if (existing) {
    db.prepare("UPDATE domains SET status = 'error', robots_txt = robots_txt WHERE domain = ?").run(domain);
  }
  console.warn('[crawler] BLOCKED', domain, reason, url);
}

export function listDomains() {
  return db.prepare('SELECT * FROM domains ORDER BY domain').all();
}

export function replaceLinksForPage(sourceUrl, edges = []) {
  db.prepare('DELETE FROM links_graph WHERE source_url = ?').run(sourceUrl);
  const stmt = db.prepare(
    'INSERT OR REPLACE INTO links_graph (source_url, target_url, link_type, anchor_text, weight) VALUES (?, ?, ?, ?, ?)'
  );
  for (const edge of edges) {
    stmt.run(sourceUrl, edge.url, edge.type, edge.anchorText || '', edge.weight || 1);
  }
}

function toJson(v) {
  if (v == null) return null;
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
}

// Crawler orchestrator: politeness, robots.txt, sitemap bootstrap,
// discovery depth-1, page store a edges.
import { getRobotsRules } from './robots.js';
import { fetchSitemapUrls } from './sitemap.js';
import { fetchHtml, closeBrowser, getBrowser } from './browser.js';
import { parsePage } from './parser.js';
import { getDomain, normalizeUrl } from './urlutils.js';
import { scheduleNextCrawl } from './scheduler.js';
import {
  db, enqueueUrl, getPageByUrl, logBlocked,
  markQueueDone, markQueueFailed, markQueueProcessing,
  nextQueueItem, replaceLinksForPage, upsertDomain, upsertPage,
} from '../db/db.js';
let stopping = false;

const CRAWL_DEPTH = 1;
const MIN_INTERVAL_MS = 2000; // politika: max 1 request / 2 s na domnu

const lastHit = new Map();

async function politenessGate(domain_) {
  const now = Date.now();
  const lastc = lastHit.get(domain_) || 0;
  const wait = MIN_INTERVAL_MS - (now - lastc);
  if (wait > 0) {
    await new Promise(function (resolve_) { setTimeout(resolve_, wait); });
  }
  lastHit.set(domain_, now + Math.max(wait, 0));
}

function pickPriorityFor(path_) {
  const lows = ['/tag/', '/category/', '/archiv/'];
  if (lows.some(function (l_) { return path_.includes(l_); })) {
    return 0.3;
  }
  return  0.5;
}

async function crawlOne(queueItem_) {
  const url = normalizeUrl(queueItem_.url);
  if (!url) {
    markQueueFailed(queueItem_.id, 'invalid url');
    return;
  }

  const domain = getDomain(url);
  await politenessGate(domain);

  let robotRules;
  try {
    robotRules = await getRobotsRules(domain);
  } catch (err_) {
    robotRules = { allowed: true, sitemaps: [], crawlDelay: null };
  }

  if (!robotRules.allowed) {

    logBlocked(domain, url, 'robots.txt: Disallow /');
    const ts = Math.floor(Date.now() / 1000);
    upsertDomain(domain, {
      status: 'blocked',
      robots_txt: 'disallow all',
      robots_txt_date: ts,
    });
    markQueueFailed(queueItem_.id, 'blocked by robots.txt');
    return;
  }

  upsertDomain(domain, {
    status: 'active',
    robots_txt_date: Math.floor(Date.now() / 1000),
    crawl_delay: robotRules.crawlDelay || null,
  });

  const browser = await getBrowser();
  const fetched = await fetchHtml(url, browser);
  if (!fetched) {
    markQueueFailed(queueItem_.id, 'fetch failed');
    return;
  }
  if (fetched.status >= 400) {
    markQueueFailed(queueItem_.id, 'http ' + fetched.status)
    return;
  }

  const parsed = parsePage(fetched.html, fetched.finalUrl || url, {
    lastModified: fetched.lastModified || null,
  });

  if (parsed.noIndex) {
    markQueueDone(queueItem_.id);
    return;
  }

  const existing = getPageByUrl(parsed.url);
  const depth = (existing && existing.crawl_depth ? existing.crawl_depth : queueItem_.source === 'user_input' ? 0 : 1);
  const nextCrawl = scheduleNextCrawl({ ...parsed, crawl_status: 'indexed', retry_count: 0 });

  const page = {
    url: parsed.url,
    domain: parsed.domain,
    title: parsed.title,
    description: parsed.description,
    contentText: parsed.contentText,
    contentHash: parsed.contentHash,
    ogData: parsed.ogData,
    schemaOrg: parsed.schemaOrg,
    headings: parsed.headings,
    linksInternal: parsed.linksInternal,
    linksExternal: parsed.linksExternal,
    wordCount: parsed.wordCount,
    wordCount: parsed.wordCount,
    crawlDepth: depth,
    crawlStatus: 'indexed',
    priority: pickPriorityFor(parsed.url),
    lastModified: parsed.lastModified,
    nextCrawl: nextCrawl,
  };
  upsertPage(page);
  replaceLinksForPage(parsed.url, parsed.edges);
  markQueueDone(queueItem_.id);

  // Discovery: interni odkazy ze stranky
  const dom = domain;
  for (const edge of parsed.edges) {
    if (edge.type !== 'internal') {
      continue;
    }
    const targetDomain = getDomain(edge.url);
    if (targetDomain !== dom) {
      continue;
    }
    const pu = getPageByUrl(edge.url);
    if (pu && pu.crawl_status === 'indexed') {
      continue;
    }
    if (depth >= CRAWL_DEPTH) {
      continue;
    }
    enqueueUrl(edge.url, dom, 'discovery', 0.4);
  }

  // Sitemap bootstrap pri prvnim crawlovani domeny
  upsertDomain(dom, { last_crawled: Math.floor(Date.now() / 1000), });
  const dRow = db.prepare('SELECT * FROM domains WHERE domain = ?').get(dom);
  if (dRow && (!dRow.sitemap_urls || dRow.sitemap_urls === '[]')) {
    if (robotRules.sitemaps.length) {
      const smUrls = await fetchSitemapUrls(robotRules.sitemaps, dom);
      upsertDomain(dom, {
        sitemap_urls: JSON.stringify(smUrls.slice(0, 200)),
        crawl_allowed: 1,
      });
      for (const su of smUrls) {
        const tu = getDomain(su);
        if (tu !== dom) {
          continue;
        }
        const p2 = getPageByUrl(su);
        if (p2 && p2.crawl_status === 'indexed') {
          continue;
        }
        enqueueUrl(su, dom, 'sitemap', 0.6);
      }
    } else {
      upsertDomain(dom, { crawl_allowed: 1 });
    }
  }
}

export async function runQueueOnce() {
  const item = nextQueueItem();
  if (!item) {
    return  0;
  }

  markQueueProcessing(item.id);
  try {
    await crawlOne(item);
  } catch (err_) {
    console.error('[crawler] chyba:', err_.message || err_);
    markQueueFailed(item_.id, String(err_.message || err_));
  }
  return  1;
}

export async function startCrawlerLoop() {
  const running = new Set();
  stopping = false;
  while (!stopping) {
    const item = nextQueueItem();
    if (item) {
      if (running.has(item.id)) {
        await new Promise(r => setTimeout(r, 500));
        continue;
      }
      running.add(item.id);
      markQueueProcessing(item.id);
      crawlOne(item)
        .then(() => { running.delete(item.id); })
        .catch((err) => {
          console.error('[crawler] chyba:', err.stack || err);
          markQueueFailed(item.id, String(err.message || err));
          running.delete(item.id);
        });
    } else {
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}

export async function stopCrawler() {
  stopping = true;
}

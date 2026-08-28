// Parser: extracts title, meta tags, OG tags, schema.org, headings and links.
import { createHash } from 'node:crypto';
import { JSDOM } from 'jsdom';
import { getDomain, isInternal, toAbsolute } from './urlutils.js';

const EXCLUDE_TAGS = new Set([
  'script',
  'style',
  'noscript',
  'template',
  'svg',
  'canvas',
  'iframe',
  'nav',
  'footer',
  'header',
  'aside',
  'form'
]);

function normalizeSpace(s) {
  if (!s) {
    return '';
  }
  return s.replace(/\s+/g, ' ').trim();
}

function extractText(root) {
  const walker = root.ownerDocument.createTreeWalker(root, root.ownerDocument.defaultView.NodeFilter.SHOW_TEXT);
  const parts = [];
  let node;
  while (true) {
    node = walker.nextNode();
    if (!node) {
      break;
    }
    const parent = node.parentNode;
    if (parent && EXCLUDE_TAGS.has(parent.tagName ? parent.tagName.toLowerCase() : '')) {
      continue;
    }
    const v = node.nodeValue;
    if (v && v.trim()) {
      parts.push(v.trim());
    }
  }
  return parts.join(' ');
}

function unique(arr) {
  return Array.from(new Set(arr.filter(Boolean)));
}

function truncate(arr, max) {
  if (!arr) {
    return [];
  }
  return arr.slice(0, max);
}

export function parsePage(html, url, extra) {
  let opt;
  if (extra) {
    opt = extra;
  } else {
    opt = {};
  }

  let html2 = html
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
  let dom;
  try {
    dom = new JSDOM(html2);
  } catch (e) {
    dom = new JSDOM('<html><body>' + html2.slice(0, 80000) + '</body></html>');
  }
  const doc = dom.window.document;
  const domain = getDomain(url);

  let title = '';
  const titleNode = doc.querySelector('title');
  if (titleNode) {
    title = normalizeSpace(titleNode.textContent);
  }

  const metaDesc = doc.querySelector('meta[name="description"]');
  let description = '';
  if (metaDesc) {
    description = normalizeSpace(metaDesc.getAttribute('content'));
  }

  const robotsMetaEl = doc.querySelector('meta[name="robots"]');
  let robotsMeta = '';
  if (robotsMetaEl) {
    robotsMeta = (robotsMetaEl.getAttribute('content') || '').toLowerCase();
  }
  const noIndex = robotsMeta.indexOf('noindex') !== -1;

  const headings = [];
  const headingNodes = doc.querySelectorAll('h1,h2,h3,h4,h5,h6');
  let hi;
  for (hi = 0; hi < headingNodes.length; hi++) {
    const h = headingNodes[hi];
    const t = normalizeSpace(h.textContent);
    if (t) {
      headings.push(t);
    }
  }

  const og = {};
  const ogNodes = doc.querySelectorAll('meta[property^="og:"]');
  let oi;
  for (oi = 0; oi < ogNodes.length; oi++) {

    const m = ogNodes[oi];
    const key = m.getAttribute('property');
    if (key) {
      og[key.replace(/^og:/, '')] = m.getAttribute('content') || '';
    }
  }

  const schema = [];
  const schemaNodes = doc.querySelectorAll('script[type="application/ld+json"]');
  let si;
  for (si = 0; si < schemaNodes.length; si++) {
    const s = schemaNodes[si];
    try {
      const parsed = JSON.parse(s.textContent || '');
      schema.push(parsed);
    } catch (err2) {
      // nevalidni JSON - preskoci se
    }
  }

  const links = [];
  const anchors = doc.querySelectorAll('a[href]');
  let ai;
  for (ai =  0; ai < anchors.length; ai++) {
    const a = anchors[ai];
    const href = a.getAttribute('href');
    if (!href) {
      continue;
    }
    const abs = toAbsolute(href, url);
    if (!abs) {
      continue;
    }
    const anchorText = normalizeSpace(a.textContent);
    const anchor = anchorText.slice(0, 200);
    if (isInternal(abs, domain)) {
      links.push({ url: abs, type: 'internal', anchor: anchor });
    } else {
      links.push({ url: abs, type: 'external', anchor: anchor });
    }
  }

  let mainEl;
  mainEl = doc.body;
  let sel;
  sel = doc.querySelector('main');
  if (sel) {
    mainEl = sel;
  } else {
    sel = doc.querySelector('article');
    if (sel) {
      mainEl = sel;
    } else {
      sel = doc.querySelector('[role="main"]');
      if (sel) {
        mainEl = sel;
      }
    }
  }

  const contentText = normalizeSpace(extractText(mainEl));
  let wordCount = 0;
  if (contentText) {
    wordCount = contentText.split(/\s+/).length;
  }
  const contentHash = createHash('sha256').update(contentText ? contentText : '').digest('hex');

  const edges = [];
  let li;
  for (li = 0; li < links.length; li++) {
    const l = links[li];
    let ty;
    if (l.type === 'internal') {
      ty = 'internal';
    } else {
      ty = 'external';
    }
    edges.push({ url: l.url, type: ty, anchor: l.anchor });
  }

  const internalUrls = [];
  const externalUrls = [];
  for (li =  0; li < links.length; li++) {
    const l = links[li];
    if (l.type === 'internal') {
      internalUrls.push(l.url);
    } else {
      externalUrls.push(l.url);
    }
  }

  return {
    url: url,
    domain: domain,
    title: title,
    description: description,
    contentText: contentText,
    contentHash: contentHash,
    ogData: JSON.stringify(og),
    schemaOrg: JSON.stringify(schema),
    headings: JSON.stringify(truncate(headings, 16)),
    linksInternal: JSON.stringify(unique(internalUrls)),
    linksExternal: JSON.stringify(unique(externalUrls)),
    edges: edges,
    wordCount: wordCount,
    noIndex: noIndex,
    lastModified: opt.lastModified ? opt.lastModified : null
  };
}

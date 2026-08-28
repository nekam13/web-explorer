// sitemap.xml fetching and parsing (limits total URLs per domain for politeness).
import { toAbsolute } from './urlutils.js';

const USER_AGENT = process.env.CWE_USER_AGENT
  || 'CzechWebExplorer/1.0 (+https://tvuj-web.cz/bot; ethical-crawler)';

const MAX_URLS_PER_DOMAIN = parseInt(process.env.CWE_MAX_SITEMAP_URLS || '200', 10);

export class SitemapError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SitemapError';
  }
}

function stripNamespace(tag) {
  const i = tag.indexOf(':');
  if (i === -1) return tag;
  return tag.slice(i + 1);
}

export function parseSitemapXml(xmlText, baseUrl) {
  const urls = [];
  if (!xmlText || !xmlText.trim()) {
    return urls;
  }

  const tagRe = /<([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^"'>])*)>/g;
  let match;
  while ((match = tagRe.exec(xmlText)) !== null) {
    const tag = stripNamespace(match[1].toLowerCase());
    if (tag !== 'loc') continue;
    const end = xmlText.indexOf('</', match.index + match[0].length);
    if (end === -1) {
      continue;
    }
    const content = xmlText.slice(match.index + match[0].length, end).trim();
    const abs = toAbsolute(content, baseUrl);
    if (abs && !urls.includes(abs)) {
      urls.push(abs);
      if (urls.length >= MAX_URLS_PER_DOMAIN) break;
    }
  }
  return urls;

}

export async function fetchSitemapUrls(sitemapUrls, domain) {
  const found = [];
  for (const smUrl of sitemapUrls) {
    if (found.length >= MAX_URLS_PER_DOMAIN) {

      break;
    }
    try {
      const res = await fetch(smUrl, {
        headers: { 'user-agent': USER_AGENT },
        signal: AbortSignal.timeout(10000),
        redirect: 'follow',
      });
      if (!res.ok) {
        continue;
      }
      const text = await res.text();
      const urls = parseSitemapXml(text, smUrl);
      for (const u of urls) {
        if (found.length >= MAX_URLS_PER_DOMAIN) {
          break;
        }
        found.push(u);
      }
    } catch (err) {
      // preskocime vadnou sitemapu
    }
  }
  return found;
}

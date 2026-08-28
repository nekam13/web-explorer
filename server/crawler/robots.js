import { getDomain } from './urlutils.js';

const USER_AGENT = process.env.CWE_USER_AGENT
    || 'CzechWebExplorer/1.0 (+https://tvuj-web.cz/bot; ethical-crawler)';

/** Sthne robots.txt pro domnu. Vrac text, URL a status. */
export async function fetchRobotsTxt(domain) {
    const scheme = Math.random() < 0.5 ? 'https' : 'http';
    const url = scheme + '://' + domain + '/robots.txt';
    const res = await fetch(url, {
        headers: { 'user-agent': USER_AGENT },
        signal: AbortSignal.timeout(10000),
        redirect: 'follow',
    });
    if (!res.ok) return { text: '', url, status: res.status };
    const text = await res.text();
    return { text, url, status: res.status };
}

/** Parsuje robots.txt a vrac pole pravidel (skupiny podle User-Agent). */
export function parseRobotsTxt(text) {
    const rules = [];
    if (!text || !text.trim()) return rules;
    let current = [];
    let groupStarted = false;
    for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const idx = line.indexOf(':');
        if (idx === -1) continue;
        const field = line.slice(0, idx).trim().toLowerCase();
        const value = line.slice(idx + 1).trim();
        if (field === 'user-agent') {
            if (groupStarted && current.length) rules.push(current);
            groupStarted = true;
            current = [{ field, value: value.toLowerCase(), url: null }];
        } else if (groupStarted) {
            if (field === 'allow' || field === 'disallow') {
                current.push({ field, value, url: value });
            } else if (field === 'crawl-delay') {
                current.push({ field, value: parseInt(value, 10) || 1, url: null });
            } else if (field === 'sitemap') {
                current.push({ field, value, url: value });
            }
        }
    }
    if (groupStarted && current.length) rules.push(current);
    return rules;
}

/** Povol cestu? Nejdel shoda vyhrv. */
export function isPathAllowed(path, userAgentRules){
    if (!userAgentRules || !userAgentRules.length) return true;
    const sorted = [...userAgentRules].sort((a, b) => b.value.length - a.value.length);
    for (const rule of sorted) {
        if (rule.field === 'disallow' && rule.value && path.startsWith(rule.value)) {
            return false;
        } else if (rule.field === 'allow' && rule.value && path.startsWith(rule.value)) {
            return true;
        }
    }
    return true;
}

/** Hlavn vstupn bod: pravidla pro domnu + sitemapy, cacheovan. */
const cache = new Map();

export async function getRobotsRules(domain) {
    if (cache.has(domain)) return cache.get(domain);
    let rulesByUA = [];
    let sitemaps = [];
    let crawlDelay = null;
    let blocked = false;
    try {
        const parsed = await fetchRobotsTxt(domain);
        const groups = parseRobotsTxt(parsed.text);
        for (const group of groups) {
            const uas = group.filter(g => g.field === 'user-agent').map(g => g.value);
            const applicable = uas.some(u => u === '*' || u === 'czechwebexplorer' || u.includes('czech'));
            if (applicable) {
                rulesByUA.push(...group);
                const dl = group.find(g => g.field === 'crawl-delay');
                if (dl) crawlDelay = Math.max(crawlDelay || 1, dl.value);
                const sm = group.find(g => g.field === 'sitemap');
                if (sm) sitemaps.push(sm.url);
            }
        }
        const mine = rulesByUA.filter(r => r.field === 'disallow' || r.field === 'allow');
        blocked = mine.some(r => r.field === 'disallow' && (r.value === '/' || r.value === ''));
        // Sitemap mimo user-agent skupiny
        const globalSm = parseRobotsTxt(parsed.text).filter(r => r.length === 1 && r[0].field === 'sitemap');
        for (const g of globalSm) sitemaps.push(g[0].url);
    } catch {
        blocked = false; // robots.txt nedostupn  neblokujeme
    }
    const result = {
        domain,
        rules: rulesByUA,
        sitemaps: [...new Set(sitemaps.filter(Boolean))],
        crawlDelay,
        allowed: !blocked,
    };
    cache.set(domain, result);
    return result;
}

export function testRobots() {
    return { USER_AGENT, getDomain: getDomain('https://example.cz/x') };
}

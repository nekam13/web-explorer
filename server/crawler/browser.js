// Browser layer: tries Playwright (headless Chromium) first, waj
// falls back to JSDOM + fetch --case Termux/lighter hosts.
import { JSDOM } from 'jsdom';

let playwrightInst;
let browserInst;
let jsdomWarned;

function warnFallbackOnce() {
  if (!jsdomWarned) {
    jsdomWarned = true;
    console.warn('[browser] Playwright neni k dispozici, pouzivam JSDOM fallback.');
  }
}

export async function getBrowser() {
  if (browserInst) {
    return browserInst;
  }
  // Dynamicky import — v ESM nelze pouzit require().
  try {
    const pw = await import('playwright');
    if (!browserInst) {
      browserInst = await pw.chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage'],
      });
    }
    playwrightInst = pw;
    return browserInst;
  } catch (err) {
    // Playwright nemusi byt nainstalovan ci dostupny — tise prepneme na JSDOM (varovani jen jednou)
    warnFallbackOnce();
    return null;
  }
}

export async function closeBrowser() {
  if (browserInst) {
    await browserInst.close();
    browserInst = null;
  }
}

export function isPlaywrightAvailable() {
  return !!browserInst;
}


function buildDom(html, url) {
  if (typeof DOMParser === 'undefined') {
    return new JSDOM(html, { url: url, contentType: 'text/html' }).window;
  }
  return null;
}

/**
 * Nacte stranku jako text HTML + resolved final URL + HTTP status.
 * @returns {{html: string, finalUrl: string, status: number, lastModified: string|null}}
 */
export async function fetchHtml(urlq, preferredBrowser) {
  const browser = preferredBrowser ? preferredBrowser : await getBrowser();

  if (browser) {
    try {
      const ctx = await browser.newContext({
        userAgent: process.env.CWE_USER_AGENT
          || 'CzechWebExplorer/1.0 (+https://tvuj-web.cz/bot; ethical-crawler)',
        locale: 'cs-CZ',
      });
      const page = await ctx.newPage();
      const resp = await page.goto(urlq, {
        waitUntil: 'networkidle',
        timeout: 20000,
      });
      const status = resp ? resp.status() : 0;
      const lastModified = resp && resp.headers() ? (resp.headers()['last-modified'] || null) : null;
      const html = await page.content();
      const finalUrl = page.url();
      await ctx.close();
      return { html: html, finalUrl: finalUrl, status: status, lastModified: lastModified };
    } catch (err) {
      console.error('[browser] Playwright chyba:', err.message || err);
      return null;
    }
  }

  // JSDOM fallback
  try {
    const res = await fetch(urlq, {
      headers: { 'user-agent': process.env.CWE_USER_AGENT || 'CzechWebExplorer/1.0' },
      redirect: 'follow',
      signal: AbortSignal.timeout(20000),
    });
    const status = res.status;
    const lastModified = res.headers.get('last-modified') || null;
    const html = await res.text();
    return { html: html, finalUrl: urlq, status: status, lastModified: lastModified };
  } catch (err) {
    console.error('[browser] fetch chyba:', err.message || err);
    return null;
  }
}
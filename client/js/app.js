'use strict';

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function badge(ok, text = ok ? 'ok' : 'chyba') {
  return `<span class="badge ${ok ? 'ok' : 'bad'}">${esc(text)}</span>`;
}

async function api(path, opts) {
  const res = await fetch('/api' + path, opts);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

async function loadStats() {
  try {
    const s = await api('/stats');
    $('#st-domains').textContent = s.domains;
    $('#st-pages').textContent = s.pages;
    $('#st-words').textContent = (s.words || 0).toLocaleString('cs-CZ');
    $('#st-errors').textContent = s.errors;
  } catch (e) {
    console.error(e);
  }
}

async function loadDomains() {
  try {
    const { domains } = await api('/domains');
    $('#domains-body').innerHTML = domains.map(d => {
      const sm = typeof d.sitemap_urls === 'string' && d.sitemap_urls ? JSON.parse(d.sitemap_urls||'[]').length : 0;
      return `<tr><td>${esc(d.domain)}</td><td>${badge(d.status !== 'error', d.status)}</td>
        <td>${d.robots_txt ? esc(d.robots_txt.slice(0, 60)) : '—'}</td>
        <td>${sm}</td><td>${d.last_crawled ? new Date(d.last_crawled * 1000).toLocaleString('cs-CZ') : '—'}</td></tr>`;
    }).join('');
  } catch (e) {
    console.error(e);
  }
}

async function loadQueue() {
  try {
    const { queued, items } = await api('/queue?limit=30');
    $('#queue-body').innerHTML = items.map(i => `<tr>
      <td>${esc(i.url)}</td><td>${esc(i.source || '')}</td>
      <td>${badge(i.status === 'done', i.status)}</td>
      <td>${esc(i.error_message || '')}</td></tr>`).join('');
  } catch (e) {
    console.error(e);
  }
}

async function loadGraph() {
  try {
    const g = await api('/graph');
    $('#graph-list').innerHTML = (g.nodes || []).map(n => `<a href="${esc(n.url)}" target="_blank" rel="noopener">${esc(new URL(n.url).pathname || n.url)}</a>`).join('') || '<p class="hint">Zatím žádné uzly.</p>';
  } catch (e) {
    console.error(e);
  }
}

async function runSearch(q) {
  const box = $('#search-results');
  box.innerHTML = '<li class="hint">Hledám…</li>';
  try {
    const { results } = await api('/search?q=' + encodeURIComponent(q) + '&limit=20');
    if (!results.length) {
      box.innerHTML = '<li class="hint">Nic nenalezeno.</li>';
      return;
    }
    box.innerHTML = results.map(r => `<li>
      <a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.title || r.url)}</a>
      <div class="url">${esc(r.url)}</div>
      <div class="snippet">${esc(r.snippet || '')}</div>
    </li>`).join('');
  } catch (e) {
    box.innerHTML = `<li class="message err">Chyba: ${esc(e.message)}</li>`;
  }
}

function showNav(tabId) {
  $$('nav a').forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + tabId));
  $$('main .panel').forEach(p => p.style.display = p.id === tabId ? 'block' : 'none');
}

document.addEventListener('DOMContentLoaded', () => {
  $$('nav a').forEach(a => a.addEventListener('click', (e) => {
    e.preventDefault();
    const tab = a.getAttribute('href').slice(1);
    showNav(tab);
    history.replaceState(null, '', '#' + tab);
  }));
  const tab = (location.hash || '#dashboard').slice(1);
  showNav(document.getElementById(tab) ? tab : 'dashboard');

  $('#crawl-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = $('#crawl-url').value.trim();
    if (!url) return;
    try {
      await api('/crawl', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
      showMessage('Přidáno do fronty.');
      $('#crawl-url').value = '';
      loadQueue();
    } catch (err_) {
      showMessage('Chyba: ' + err_.message, true);
    }
  });

  $('#search-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = $('#search-q').value.trim();
    if (q) runSearch(q);
  });

  loadStats();
  loadDomains();
  loadQueue();
  loadGraph();
  setInterval(loadStats, 10000);
  setInterval(loadQueue, 15000);
});

function showMessage(text, isError = false) {
  const old = $('.message');
  if (old) old.remove();
  const m = document.createElement('div');
  m.className = 'message ' + (isError ? 'err' : 'ok');
  m.textContent = text;
  $('#dashboard').prepend(m);
  setTimeout(() => m.remove(), 5000);
}
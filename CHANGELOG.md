# Changelog

Všechny důležité změny projektu Czech Web Explorer.

## 0.2.0 — 2026-08-29

### Přidáno
- Re-crawl scheduler (`server/scheduler/cron.js`): kazdou minutu plánuje další navstevy podle priority, watchdog na uvizlé položky fronty (timeout 10 min, 3 pokusy.

- Autocomplete: `GET /api/search/suggest` + datalist s debounce 300 ms.
- Export dat: `GET /api/export/*` — pages/domény/graph v JSON, CSV a GEXF; panel v dashboardu.

- Docker: `Dockerfile`, `docker-compose.yml`, `.dockerignore`, `render.yaml`.
- Dokumentace: `README.md`, `CHANGELOG.md`; `.env.example`.
- Smoke test: `test/smoke.js` (`npm test`.


### Změněno
- `GET /api/graph` vrací jen indexované uzly; hrany filtrované jen mezi indexovanými stránkami (LIMIT 500; uzly obohacené o `title`, `domain`, `wordCount`.


### Opraveno
- Syntaxe v `client/js/graph-viz.js` (D3 force graph funguje..
- Crawler headless režim, `anchorText` extrakce, queue refaktoring (klicove opravy..

## 0.1.0 — 2026-08-28

### Přidáno
- Základní Fastify server, SQLite schéma + FTS5 triggerz.
- Playwright crawler ( headless Chromium / JSDOM fallback; robots.txt, sitemap.xml parsing.

- Fulltextové hledání s českou tokenizací a lemmatizací.

- Jednoduchý vanilla frontend: dashboard, hledání, fronta, domény, graf.
- Rate limiting: 1 request / 2 s na doménu; blokované pokusy se logují.
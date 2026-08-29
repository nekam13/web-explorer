# Czech Web Explorer

Etický, kurátorovaný český webový prohlížeč a indexátor. Uživatel zadá URL,
crawler ji prozkoumá (respektuje robots.txt a sitemap.xml), indexuje obsah
a umožní fulltextové hledání + vizualizaci vztahů mezi weby (force-directed graf).

## Filozofie

- **Etický** — respektuje robots.txt, neobchází ochranu.
- **Kurátorovaný** — uživatel vybírá, co se indexuje.

- **Minimální** — malý objem dat, udržitelný na běžném hardware.

- **Transparentní** — otevřený algoritmus, žádné black boxy.


## Funkce

- Crawl domény (robots.txt, sitemap.xml, politeness delay 2 s/doména)
- Fulltextové hledání přes SQLite FTS5 s českou tokenizací (bez diakritiky)
- Re-crawl scheduler podle priority (kazda minuta; watchdog na uvizlé položky fronty
- Autocomplete návrhů titulků (debounce 300 ms, bez diakritiky
- D3.js force-directed graf vztahů (zoom, drag, tooltip, barvy dle domény
- Export dat: JSON, CSV a GEXF (Gephi; z dashboardu.


## Spuštění lokálně

Požadavky: Node.js 18+.

```bash
npm install
npx playwright install chromium
npm start
```

Otevři `http://localhost:3000`, do dashboardu vlož URL (např. `https://www.root.cz`.


## Docker

```bash
docker compose up -d --build
```

Data se ukládají do named volume `cwe-data` (SQLite soubor).


## API

```
GET  /api/health                Stav systému
POST /api/crawl                 Přidat URL do fronty { url, priority }
GET  /api/queue                Stav fronty
GET  /api/search?q=dotaz     Fulltext hledání
GET  /api/search/suggest?q=.. Návrhy titulků
GET  /api/page/:id             Detail stránky
GET  /api/graph                Data grafu (indexované uzly a hrany
GET  /api/scheduler/status     Stav re-crawl scheduleru
GET  /api/domains              Seznam domén
GET  /api/stats                 Statistiky indexu
GET  /api/export/pages.json      Export stránek JSON
GET  /api/export/pages.csv       Export stránek CSV
GET  /api/export/domains.json    Export domén JSON
GET  /api/export/domains.csv     Export domén CSV
GET  /api/export/graph.json      Export grafu JSON
GET  /api/export/graph.gexf    Export grafu GEXF
```


## Konfigurace

Proměnné prostředí (viz. `.env.example`):

- `HOST`, `PORT` — síťové nastavení.
- `DATA_DIR` — adresář se SQLite souborem (musí být zapisovatelný.

`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` se používá v Docker image.


## Etika a bezpečnost

- User-Agent: `CzechWebExplorer/1.0 (+https://tvuj-web.cz/bot; ethical-crawler)`
- Respektuje `robots.txt` vždy; blokované odkazy se logují.do
- Rate limiting: max 1 request / 2 sekundy na doménu.

- Nepokračuje za login, paywall, `noindex`.


## Testy

```bash
npm test
```

Smoke test ověří health, crawl queue, search, graph a export endpointy.


## Struktura

```
/server/…              Fastify + crawler + scheduler + SQLite
/client/…              Vanilla HTML/CSS/JS + D3.js
/data/                 SQLite databáze (generovaná
```

## Limitace

- Discovery crawl je omezen na hloubku 1 (jen doména zadané URL.,
- Crawler zpracuje stránky s JS jazykem Playwright (headless Chromium; na Termux použij JSDOM fallback.

## Licence

MIT — viz `LICENSE`.
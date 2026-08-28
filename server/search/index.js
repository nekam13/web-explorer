import { db } from '../db/db.js';

const STOP_WORDS_CZ = new Set([
  'a', 'aby', 'aj', 'ale', 'anebo', 'ani', 'aniz', 'az', 'ba', 'bez', 'beze',
  'blizko', 'bude', 'budem', 'budes', 'by', 'byl', 'byla', 'byli', 'bylo',
  'byt', 'ci', 'clanek', 'clanku', 'clanky', 'co', 'com', 'coz', 'cz', 'dalsi',
  'design', 'dnes', 'do', 'dokud', 'dve', 'email', 'ho', 'i', 'jak', 'jake',
  'je', 'jeho', 'jej', 'jeji', 'jejich', 'jen', 'jenz', 'jeste', 'ji', 'jine',
  'jiz', 'jsem', 'jses', 'jsi', 'jsme', 'jsou', 'jste', 'k', 'kam', 'kde',
  'kdo', 'kdyz', 'ke', 'ktera', 'ktere', 'kteri', 'kterou', 'ktery', 'ku',
  'ma', 'mate', 'me', 'mezi', 'mi', 'mit', 'mne', 'mnou', 'muj', 'muze',
  'my', 'na', 'nad', 'nade', 'nam', 'napiste', 'nas', 'nasi', 'ne', 'nebo',
  'necht', 'nejsou', 'neni', 'neni', 'net', 'nevim', 'novy', 'nybrz', 'o',
  'od', 'ode', 'on', 'ona', 'oni', 'ono', 'ony', 'osobne', 'pak', 'po', 'pod',
  'podle', 'pokud', 'pouze', 'prave', 'pred', 'pres', 'pri', 'pro', 'proc',
  'proto', 'protoze', 'prvni', 'pta', 're', 's', 'se', 'si', 'sice', 'strana',
  'sve', 'svuj', 'svych', 'svym', 'svymi', 'ta', 'tak', 'take', 'takze', 'tato',
  'te', 'tedy', 'tema', 'ten', 'tento', 'teto', 'tim', 'timto', 'to', 'tohle',
  'toho', 'tohoto', 'tom', 'tomto', 'tomu', 'toto', 'tu', 'tudiz', 'tuto',
  'tvuj', 'ty', 'tyto', 'u', 'uz', 'v', 'vam', 'vas', 'vase', 've', 'vice',
  'vsak', 'vsichni', 'vsechen', 'vy', 'vzhledem', 'z', 'za', 'zda', 'zde',
  'ze', 'zpet', 'zpravy',
]);

export function tokenizeCzech(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS_CZ.has(w));
}

function escFts(term) {
  return term.replace(/"/g, '""');
}

export function searchPages(q, limit = 20) {
  const terms = tokenizeCzech(q);
  if (!terms.length) return [];
  const safe = terms.map(escFts);
  const match = safe.map(t => `"${t}"*`).join(' OR ');
  const rows = db.prepare(
    "SELECT p.id, p.url, p.domain, p.title, p.description," +
    " substr(p.content_text,1,300) AS snippet," +
    " bm25(pages_fts) AS score" +
    " FROM pages_fts JOIN pages p ON p.id = pages_fts.rowid" +
    " WHERE pages_fts MATCH ? ORDER BY score LIMIT ?"
  ).all(match, limit);
  return rows;

}

export function searchPagesLike(q, limit = 20) {
  const term = tokenizeCzech(q).join('%');
  if (!term) return [];
  const pattern = '%' + term + '%';
  return db.prepare(
    "SELECT id, url, domain, title, description, substr(content_text,1,300) AS snippet" +
    " FROM pages WHERE lower(content_text) LIKE lower(?) OR lower(title) LIKE lower(?)" +
    " ORDER BY last_crawled DESC LIMIT ?"
  ).all(pattern, pattern, limit);
}

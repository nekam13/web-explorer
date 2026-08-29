import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 3100;
const BASE = 'http://127.0.0.1:' + PORT;
const tmp = mkdtempSync(join(tmpdir(), 'cwe-smoke-'));

const server = spawn(process.execPath, ['server/server.js'], {
  cwd: join(new URL('..', import.meta.url).pathname),
  env: { ...process.env, PORT: String(PORT), DATA_DIR: tmp, HOST: '127.0.0.1' },
  stdio: 'ignore',
});

let failures = 0;
let checks =  0;

function check(name, ok) {
  checks++;
  console.log((ok ? 'OK' : 'FAIL') + ' ' + name);
  if (!ok) failures++;
}

async function waitForHealth(attempts = 40) {
  for (let i =  0; i < attempts; i++) {
    try {
      const r = await fetch(BASE + '/api/health');
      if (r.ok) return true;
    } catch (_) { /* stale startuje */ }
    await new Promise(res => setTimeout(res, 500));
  }
  return false;
}

async function getJson(path) {
  const r = await fetch(BASE + path);
  const text = await r.text();
  try {
    return { text, json: JSON.parse(text) };
  } catch (_) {
    return { text, json: null };
  }
}

async function main() {
  if (!(await waitForHealth())) {
    check('server health', false);
    finish();
    return;
  }
  check('server health', true);

  const health = await getJson('/api/health');
  check('health.status.ok', health.json?.status === 'ok');

  const stats = await getJson('/api/stats');
  check('stats.pages', typeof stats.json?.pages === 'number');

  const search = await getJson('/api/search?q=test');
  check('search.200', search.text.includes('"results"'));

  const suggest = await getJson('/api/search/suggest?q=t');
  check('suggest.json', Array.isArray(suggest.json?.suggestions));

  const graph = await getJson('/api/graph');
  check('graph.nodes.array', Array.isArray(graph.json?.nodes));

  const schedulerStatus = await getJson('/api/scheduler/status');
  check('scheduler.running', schedulerStatus.json?.running === true);

  const domains = await getJson('/api/domains');
  check('domains.array', Array.isArray(domains.json?.domains));

  const exportPages = await getJson('/api/export/pages.json');
  check('export.pages.json', exportPages.json !== null);

  const exportDomainsCsv = await fetch(join(BASE, '/api/export/domains.csv'));
  check('export.domains.csv', exportDomainsCsv.headers.get('content-type')?.includes('text/csv'));

  const exportGexf = await fetch(join(BASE, '/api/export/graph.gexf'));
  check('export.graph.gexf', exportGexf.ok);

  finish();
}

function finish() {
  server.kill('SIGTERM');
  try { rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
  console.log('\n' + checks + ' checks, ' + failures + ' failures');
  process.exit(failures ? 1 : 0);
}

process.on('SIGINT', finish);
process.on('SIGTERM', finish);

main().catch(err => { console.error(err); finish(); });
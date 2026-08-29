import { db } from '../db/db.js';

// Re-crawl scheduler: kazdou minutu zkontroluje, které stránky mají
// naplánovaný next_crawl v minulosti, a vloží je znovu do fronty (source 'recrawl').
// Zároveň hlídá uvizlé položky fronty (status 'processing' déle než 10 minut).

const TICK_MS = 60 * 1000;
const STUCK_MS =10 * 60 * 1000;

let timer = null;
let lastRun = null;
let runs = 0;
let enqueued = 0;
let stuck = 0;

export function startScheduler(intervalMs = TICK_MS) {
  if (timer) return;
  tick();
  timer = setInterval(tick, intervalMs);
}

export function stopScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}

export function getSchedulerStatus() {
  return {
    running: !!timer,
    last_run: lastRun,
    runs,
    enqueued,
    stuck_recovered: stuck,
  };
}

function tick() {
  const now = Date.now();
  const nowSec = Math.floor(now / 1000);

  const due = db.prepare(
    "SELECT id, url, domain, priority FROM pages WHERE next_crawl IS NOT NULL AND next_crawl <= ? AND crawl_status IN ('indexed','queued','error') ORDER BY priority DESC LIMIT 200"
  ).all(nowSec);

  const insert = db.prepare(
    "INSERT INTO queue (url, domain, source, priority, status) SELECT ?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM queue WHERE url = ? AND status IN ('pending','processing'))"
  );

  const tx = db.transaction((rows) => {
    for (const p of rows) {
      insert.run(p.url, p.domain, 'recrawl', p.priority || 0.5, 'pending', p.url);
      db.prepare("UPDATE pages SET crawl_status = 'queued' WHERE id = ?").run(p.id);
    }
  });
if (due.length) {
  tx(due);
  enqueued += due.length;
}

  // Watchdog: processing �� 10 min => vrat do fronty / oznac za failed.



  const stuckItems = db.prepare(
    "SELECT id, url, retry_count FROM queue WHERE status = 'processing' AND processed_at IS NOT NULL AND processed_at <= ? LIMIT 100"
  ).all(now - STUCK_MS);

  const requeue = db.prepare(
    "UPDATE queue SET status = 'pending', processed_at = NULL, error_message = 'timeout (uvizla polozka)', retry_count = retry_count +  1 WHERE id = ?"
  );
const fail = db.prepare(
    "UPDATE queue SET status = 'failed', error_message = 'timeout (uvizla polozka)', processed_at = NULL WHERE id = ?"
  );

  for (const item of stuckItems) {
    if ((item.retry_count || 0) < 3) {
      requeue.run(item.id);
    } else {
      fail.run(item.id);
      db.prepare("UPDATE pages SET crawl_status = 'error' WHERE url = ?").run(item.url);
    }
    stuck++;
  }

  lastRun = new Date().toISOString();
  runs++;
}
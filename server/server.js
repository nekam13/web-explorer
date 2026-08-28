import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerCrawlRoutes } from './routes/crawl.js';
import { registerQueueRoutes } from './routes/queue.js';
import { registerDomainRoutes } from './routes/domains.js';
import { registerStatsRoutes } from './routes/stats.js';
import { registerPageRoutes } from './routes/page.js';
import { registerSearchRoutes } from './routes/search.js';
import { registerGraphRoutes } from './routes/graph.js';
import { db, DATA_DIR } from './db/db.js';
import { startCrawlerLoop, stopCrawler } from './crawler/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const host = process.env.HOST || '0.0.0.0';
const port = Number(process.env.PORT) || 3000;

const app = Fastify({ logger: true });

const CLIENT_DIR = join(__dirname, '../client');
app.register(fastifyStatic, {
  root: CLIENT_DIR,
  prefix: '/',
  index: 'index.html',
});
app.setNotFoundHandler((req, reply) => {
  if (req.url.startsWith('/api/')) {
    return reply.code(404).send({ error: 'not found' });
  }
  return reply.sendFile('index.html');
});

app.register(registerCrawlRoutes);
app.register(registerQueueRoutes);
app.register(registerDomainRoutes);
app.register(registerStatsRoutes);
app.register(registerPageRoutes);
app.register(registerSearchRoutes);
app.register(registerGraphRoutes);

app.get('/api/health', async () => {
  return {
    status: 'ok',
    time: new Date().toISOString(),
    dataDir: DATA_DIR,
  };
});

app.listen({ host, port }).then(async () => {
  app.log.info('Czech Web Explorer na portu ' + port);
  startCrawlerLoop().catch(err => console.error(err));
});

const shutdown = async () => {
  app.log.info('Ukoncuji...');
  await stopCrawler();
  await app.close();
  db.close();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

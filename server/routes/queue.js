import { listQueue, countQueued } from '../db/db.js';

export async function registerQueueRoutes(app) {
  app.get('/api/queue', async (req) => {
    const limit = Math.min(100, Number(req.query?.limit) || 50);
    return {
      queued: countQueued(),
      items: listQueue({ limit }),
    };
  });
}
import { getPage } from '../db/db.js';

export async function registerPageRoutes(app) {
  app.get('/api/page/:id', async (req, reply) => {
    const page = getPage(Number(req.params.id));
    if (!page) {
      return reply.code(404).send({ error: 'Stranka nenalezena' });
    }
    return reply.send({ page });
  });
}

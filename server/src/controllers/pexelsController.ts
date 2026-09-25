import { Request, Response } from 'express';
import { pexelsService } from '../services/pexelsService.js';
import { logger } from '../utils/logger.js';

export const pexelsController = {
  async search(req: Request, res: Response) {
    const q = req.query.q as string;
    const perPage = parseInt((req.query.per_page as string) || '15', 10);
    const page = parseInt((req.query.page as string) || '1', 10);

    if (!q || q.trim().length === 0) {
      return res.status(400).json({ error: 'Termo de busca obrigatório' });
    }

    try {
      const results = await pexelsService.searchPhotos(q.trim(), perPage, page);
      return res.json(results);
    } catch (err: any) {
      logger.error('Erro na rota de busca do Pexels:', { error: err.message, query: q });
      return res.status(500).json({ error: 'Erro ao buscar imagens no Pexels' });
    }
  },
};

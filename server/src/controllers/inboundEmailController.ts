import { Request, Response } from 'express';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { inboundEmailService } from '../services/inboundEmailService.js';

export const inboundEmailController = {
  async handleInboundEmail(req: Request, res: Response) {
    const secretHeader = req.headers['x-inbound-secret'];
    const secretQuery = req.query.secret;

    const providedSecret = (typeof secretHeader === 'string' ? secretHeader : (typeof secretQuery === 'string' ? secretQuery : ''));

    if (!providedSecret || providedSecret !== env.INBOUND_EMAIL_SECRET) {
      logger.warn('Tentativa de envio para endpoint inbound com segredo invalido ou ausente');
      return res.status(401).json({ error: 'Nao autorizado. X-Inbound-Secret invalido.' });
    }

    let rawBuffer: Buffer | null = null;

    if (Buffer.isBuffer(req.body)) {
      rawBuffer = req.body;
    } else if (typeof req.body === 'string') {
      rawBuffer = Buffer.from(req.body, 'utf-8');
    }

    if (!rawBuffer || rawBuffer.length === 0) {
      logger.warn('Payload vazio recebido no endpoint de inbound email');
      return res.status(400).json({ error: 'Nenhum conteudo de e-mail (MIME) recebido no corpo da requisicao' });
    }

    try {
      logger.info(`Processando e-mail recebido via inbound (${rawBuffer.length} bytes)...`);
      const result = await inboundEmailService.processInboundEmail(rawBuffer);

      return res.status(200).json(result);
    } catch (err: any) {
      logger.error('Erro ao processar e-mail inbound no controller:', { error: err.message, stack: err.stack });
      // Retorna 200 com erro estruturado para que o MDA/Postfix nao entre em loop infinito de retentativas
      return res.status(200).json({
        success: false,
        error: 'Falha interna ao processar o e-mail recebido',
        details: err.message,
      });
    }
  },
};

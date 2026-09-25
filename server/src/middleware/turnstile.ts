import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export async function verifyTurnstile(req: Request, res: Response, next: NextFunction) {
  if (!env.TURNSTILE_ENABLED) {
    return next();
  }

  const token = req.body['cf-turnstile-response'] || req.body.turnstileToken;
  if (!token) {
    return res.status(400).json({ error: 'Validação de segurança (Turnstile) obrigatória.' });
  }

  const rawIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() || req.socket.remoteAddress;
  // Cloudflare rejects invalid or private remoteip with 'invalid-remoteip' error code
  const isPrivateIp = (ip?: string) =>
    !ip ||
    ip === '::1' ||
    ip.startsWith('127.') ||
    ip.startsWith('10.') ||
    ip.startsWith('172.') ||
    ip.startsWith('192.168.') ||
    ip.startsWith('fe80:');

  try {
    const formData = new URLSearchParams();
    formData.append('secret', env.TURNSTILE_SECRET);
    formData.append('response', token);
    if (rawIp && !isPrivateIp(rawIp)) {
      formData.append('remoteip', rawIp);
    }

    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: formData,
    });

    const result: any = await response.json();

    if (!result.success) {
      const errorCodes = result['error-codes'] ? result['error-codes'].join(', ') : 'unknown';
      logger.warn('Falha na validação do Cloudflare Turnstile', { errorCodes, result, rawIp });
      return res.status(403).json({ error: `Validação do Turnstile falhou (${errorCodes}). Tente novamente.` });
    }

    next();
  } catch (err: any) {
    logger.error('Erro ao contatar serviço do Cloudflare Turnstile', { error: err.message });
    return res.status(500).json({ error: 'Erro ao validar desafio de segurança' });
  }
}

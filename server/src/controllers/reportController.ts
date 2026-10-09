import { Request, Response } from 'express';
import crypto from 'crypto';
import path from 'path';
import { reportService } from '../services/reportService.js';
import { pdfService } from '../services/pdfService.js';
import { tripBookPdfService } from '../services/tripBookPdfService.js';
import { query } from '../db/pool.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

const SHORT_TOKEN_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ';

async function generateShortToken(length = 7): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const bytes = crypto.randomBytes(length);
    let token = '';
    for (let i = 0; i < length; i++) {
      token += SHORT_TOKEN_ALPHABET[bytes[i] % SHORT_TOKEN_ALPHABET.length];
    }
    const { rows } = await query('SELECT id FROM trips WHERE share_token = $1', [token]);
    if (rows.length === 0) {
      return token;
    }
  }
  return crypto.randomBytes(6).toString('base64url').replace(/[-_]/g, 'a').slice(0, 8);
}

export const reportController = {
  // 1. Get structured data for Report Editor
  async getReportData(req: Request, res: Response) {
    const { tripId } = req.params;

    try {
      const data = await reportService.getTripBookData(tripId);
      return res.json(data);
    } catch (err: any) {
      logger.error('Erro ao buscar dados do relatório:', { error: err.message });
      return res.status(500).json({ error: 'Erro ao gerar dados do relatório' });
    }
  },

  // 2. Render Print-ready HTML
  async renderHtml(req: Request, res: Response) {
    const { tripId } = req.params;
    const { sections } = req.query;

    try {
      const data = await reportService.getTripBookData(tripId);

      let parsedSections: Record<string, boolean> | undefined;
      if (typeof sections === 'string') {
        const secList = sections.split(',').map((s) => s.trim().toLowerCase());
        parsedSections = {
          cover: secList.includes('cover'),
          overview: secList.includes('overview'),
          calendar: secList.includes('calendar'),
          climatePacking: secList.includes('climatepacking'),
          dayByDay: secList.includes('daybyday'),
          transports: secList.includes('transports'),
          hotels: secList.includes('hotels'),
          checklist: secList.includes('checklist'),
        };
      }

      const html = reportService.generateTripBookHtml(data, {
        pdfDownloadUrl: `/api/trips/${tripId}/report/pdf`,
        sections: parsedSections,
      });

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(html);
    } catch (err: any) {
      logger.error('Erro ao renderizar HTML do relatório:', { error: err.message });
      return res.status(500).send(`Erro ao gerar relatório HTML: ${err.message}`);
    }
  },

  // 3. Export PDF (Served from pre-generated cache or generated on-demand)
  async exportPdf(req: Request, res: Response) {
    const { tripId } = req.params;

    try {
      const { rows } = await query('SELECT title, subtitle FROM trips WHERE id = $1 AND deleted_at IS NULL', [tripId]);
      if (rows.length === 0) return res.status(404).json({ error: 'Viagem não encontrada' });
      const trip = rows[0];

      const pdfPath = await tripBookPdfService.getOrGeneratePdf(tripId, false);
      const filename = `TripBook_${trip.title.replace(/[^a-zA-Z0-9]/g, '_')}_completo.pdf`;

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.sendFile(path.resolve(pdfPath));
    } catch (err: any) {
      logger.error('Erro na exportação de PDF:', { error: err.message });
      return res.status(500).json({ error: `Erro ao gerar PDF: ${err.message}` });
    }
  },

  // 4. Get Share Status (Token & Enabled)
  async getShareStatus(req: Request, res: Response) {
    const { tripId } = req.params;

    try {
      let { rows } = await query(
        'SELECT id, share_token, share_enabled FROM trips WHERE id = $1 AND deleted_at IS NULL',
        [tripId]
      );

      if (rows.length === 0) {
        return res.status(404).json({ error: 'Viagem não encontrada' });
      }

      let trip = rows[0];
      if (!trip.share_token) {
        const token = await generateShortToken(7);
        const updateRes = await query(
          'UPDATE trips SET share_token = $1, share_enabled = FALSE WHERE id = $2 RETURNING id, share_token, share_enabled',
          [token, tripId]
        );
        trip = updateRes.rows[0];
      }

      const baseUrl = env.APP_URL || `${req.protocol}://${req.get('host')}`;
      const shareUrl = `${baseUrl}/s/${trip.share_token}`;

      return res.json({
        share_token: trip.share_token,
        share_enabled: Boolean(trip.share_enabled),
        share_url: shareUrl,
      });
    } catch (err: any) {
      logger.error('Erro ao consultar status de compartilhamento:', { error: err.message });
      return res.status(500).json({ error: 'Erro ao consultar status de compartilhamento' });
    }
  },

  // 5. Update Share Status (Toggle or Regenerate)
  async updateShare(req: Request, res: Response) {
    const { tripId } = req.params;
    const { enabled, regenerate } = req.body;

    try {
      let { rows } = await query(
        'SELECT id, share_token, share_enabled FROM trips WHERE id = $1 AND deleted_at IS NULL',
        [tripId]
      );

      if (rows.length === 0) {
        return res.status(404).json({ error: 'Viagem não encontrada' });
      }

      let trip = rows[0];
      let newToken = trip.share_token;
      if (!newToken || regenerate) {
        newToken = await generateShortToken(7);
      }

      const newEnabled = enabled !== undefined ? Boolean(enabled) : Boolean(trip.share_enabled);

      const updateRes = await query(
        'UPDATE trips SET share_token = $1, share_enabled = $2, updated_at = NOW() WHERE id = $3 RETURNING id, share_token, share_enabled',
        [newToken, newEnabled, tripId]
      );
      trip = updateRes.rows[0];

      const baseUrl = env.APP_URL || `${req.protocol}://${req.get('host')}`;
      const shareUrl = `${baseUrl}/s/${trip.share_token}`;

      tripBookPdfService.queuePreGeneration(tripId);

      return res.json({
        share_token: trip.share_token,
        share_enabled: Boolean(trip.share_enabled),
        share_url: shareUrl,
      });
    } catch (err: any) {
      logger.error('Erro ao atualizar compartilhamento:', { error: err.message });
      return res.status(500).json({ error: 'Erro ao atualizar compartilhamento' });
    }
  },

  // 6. Public Shared HTML View (Anonymized & Non-indexable)
  async renderPublicSharedHtml(req: Request, res: Response) {
    const { shareToken } = req.params;

    try {
      const { rows } = await query(
        'SELECT id, title, subtitle FROM trips WHERE share_token = $1 AND share_enabled = TRUE AND deleted_at IS NULL',
        [shareToken]
      );

      if (rows.length === 0) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
        return res.status(404).send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow, noarchive, nosnippet">
  <title>Roteiro Não Encontrado — Trips</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f8fafc; color: #334155; }
    .card { background: white; padding: 40px 32px; border-radius: 20px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05); text-align: center; max-width: 440px; border: 1px solid #e2e8f0; }
    h1 { font-size: 20px; margin: 12px 0 8px 0; color: #0f172a; font-weight: 700; }
    p { font-size: 14px; color: #64748b; line-height: 1.6; margin: 0; }
  </style>
</head>
<body>
  <div class="card">
    <div style="font-size: 44px; margin-bottom: 8px;">🔒</div>
    <h1>Link Indisponível ou Desativado</h1>
    <p>Este roteiro não foi encontrado ou o link de compartilhamento foi desativado pelo organizador da viagem.</p>
  </div>
</body>
</html>`);
      }

      const trip = rows[0];
      const data = await reportService.getTripBookData(trip.id);
      const pdfUrl = `/s/${shareToken}/pdf`;
      const html = reportService.generateTripBookHtml(data, {
        anonymize: true,
        isPublicShare: true,
        pdfDownloadUrl: pdfUrl,
      });

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      return res.send(html);
    } catch (err: any) {
      logger.error('Erro ao renderizar HTML compartilhado:', { error: err.message });
      return res.status(500).send(`Erro ao carregar roteiro compartilhado: ${err.message}`);
    }
  },

  // 7. Public Shared PDF Export (Anonymized, Served from pre-generated cache)
  async exportPublicSharedPdf(req: Request, res: Response) {
    const { shareToken } = req.params;

    try {
      const { rows } = await query(
        'SELECT id, title, subtitle FROM trips WHERE share_token = $1 AND share_enabled = TRUE AND deleted_at IS NULL',
        [shareToken]
      );

      if (rows.length === 0) {
        return res.status(404).json({ error: 'Roteiro não encontrado ou link desativado' });
      }

      const trip = rows[0];
      const pdfPath = await tripBookPdfService.getOrGeneratePdf(trip.id, true);
      const filename = `TripBook_${trip.title.replace(/[^a-zA-Z0-9]/g, '_')}_compartilhado.pdf`;

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.sendFile(path.resolve(pdfPath));
    } catch (err: any) {
      logger.error('Erro na exportação de PDF compartilhado:', { error: err.message });
      return res.status(500).json({ error: `Erro ao gerar PDF: ${err.message}` });
    }
  },

  // 8. Get PDF Pre-generation Status
  async getPdfStatus(req: Request, res: Response) {
    const { tripId } = req.params;

    try {
      const status = await tripBookPdfService.getPdfStatus(tripId);
      if (!status) {
        return res.status(404).json({ error: 'Viagem não encontrada' });
      }
      return res.json(status);
    } catch (err: any) {
      logger.error('Erro ao consultar status de PDF:', { error: err.message });
      return res.status(500).json({ error: 'Erro ao consultar status de PDF' });
    }
  },

  // 9. Force Immediate PDF Regeneration
  async regeneratePdf(req: Request, res: Response) {
    const { tripId } = req.params;

    try {
      await tripBookPdfService.generateBothPdfs(tripId);
      const status = await tripBookPdfService.getPdfStatus(tripId);
      return res.json({
        message: 'Trip Book PDFs regenerados com sucesso!',
        status,
      });
    } catch (err: any) {
      logger.error('Erro ao regenerar PDFs do Trip Book:', { error: err.message });
      return res.status(500).json({ error: `Erro ao regenerar PDFs: ${err.message}` });
    }
  },
};

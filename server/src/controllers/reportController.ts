import { Request, Response } from 'express';
import { reportService } from '../services/reportService.js';
import { pdfService } from '../services/pdfService.js';
import { logger } from '../utils/logger.js';

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

    try {
      const data = await reportService.getTripBookData(tripId);
      const html = reportService.generateTripBookHtml(data);

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(html);
    } catch (err: any) {
      logger.error('Erro ao renderizar HTML do relatório:', { error: err.message });
      return res.status(500).send(`Erro ao gerar relatório HTML: ${err.message}`);
    }
  },

  // 3. Export PDF
  async exportPdf(req: Request, res: Response) {
    const { tripId } = req.params;

    try {
      const data = await reportService.getTripBookData(tripId);
      const html = reportService.generateTripBookHtml(data);

      const pdfBuffer = await pdfService.htmlToPdf(html);

      const filename = `TripBook_${data.trip.title.replace(/[^a-zA-Z0-9]/g, '_')}_${data.trip.subtitle || ''}.pdf`;

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', pdfBuffer.length);
      return res.end(pdfBuffer);
    } catch (err: any) {
      logger.error('Erro na exportação de PDF:', { error: err.message });
      return res.status(500).json({ error: `Erro ao gerar PDF: ${err.message}` });
    }
  },
};

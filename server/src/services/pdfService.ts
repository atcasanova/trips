import { logger } from '../utils/logger.js';

export const pdfService = {
  async htmlToPdf(html: string): Promise<Buffer> {
    try {
      // Dynamic import puppeteer so it doesn't crash on start if libraries are being installed
      const puppeteerModule = await import('puppeteer');
      const puppeteer = puppeteerModule.default || puppeteerModule;

      const browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--single-process',
          '--no-zygote',
        ],
      });

      const page = await browser.newPage();
      try {
        await page.setContent(html, { waitUntil: 'load', timeout: 35000 });
      } catch (e) {
        logger.warn('Puppeteer setContent load timed out, using current page state', { error: (e as any)?.message });
      }
      try {
        await page.evaluateHandle('document.fonts.ready');
      } catch (e) {}

      // Wait a moment for Leaflet tile images and layout to settle
      await new Promise((resolve) => setTimeout(resolve, 1500));

      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '18mm',
          right: '16mm',
          bottom: '18mm',
          left: '16mm',
        },
      });

      await browser.close();
      return Buffer.from(pdfBuffer);
    } catch (err: any) {
      logger.error('Erro ao gerar PDF com Puppeteer:', { error: err.message });
      throw new Error(`Falha na renderização de PDF: ${err.message}`);
    }
  },
};

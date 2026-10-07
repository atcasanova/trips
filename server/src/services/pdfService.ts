import { logger } from '../utils/logger.js';
import { PDFDocument } from 'pdf-lib';

export interface HtmlToPdfOptions {
  blockImages?: boolean;
}

export const pdfService = {
  async htmlToPdf(html: string, options?: HtmlToPdfOptions): Promise<Buffer> {
    try {
      // Dynamic import puppeteer so it doesn't crash on start if libraries are being installed
      const puppeteerModule = await import('puppeteer');
      const puppeteer = puppeteerModule.default || puppeteerModule;

      const browser = await puppeteer.launch({
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
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

      if (options?.blockImages) {
        await page.setRequestInterception(true);
        page.on('request', (req) => {
          const resourceType = req.resourceType();
          if (['image', 'media'].includes(resourceType)) {
            req.abort();
          } else {
            req.continue();
          }
        });
      }

      try {
        await page.setContent(html, {
          waitUntil: (options?.blockImages ? 'domcontentloaded' : 'networkidle2') as any,
          timeout: 35000,
        });
      } catch (e) {
        logger.warn('Puppeteer setContent timed out, using current page state', { error: (e as any)?.message });
      }

      if (!options?.blockImages) {
        try {
          await page.evaluateHandle('document.fonts.ready');
        } catch (e) {}

        // Wait a moment for Leaflet tile images and layout to settle
        await new Promise((resolve) => setTimeout(resolve, 1500));
      } else {
        await new Promise((resolve) => setTimeout(resolve, 300));
      }

      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '16mm',
          right: '15mm',
          bottom: '16mm',
          left: '15mm',
        },
      });

      await browser.close();
      return Buffer.from(pdfBuffer);
    } catch (err: any) {
      logger.error('Erro ao gerar PDF com Puppeteer:', { error: err.message });
      throw new Error(`Falha na renderização de PDF: ${err.message}`);
    }
  },

  async mergePdfs(pdfBuffers: Buffer[]): Promise<Buffer> {
    const validBuffers = (pdfBuffers || []).filter((b) => Buffer.isBuffer(b) && b.length > 0);
    if (validBuffers.length === 0) {
      throw new Error('Nenhum buffer de PDF válido fornecido para mesclagem');
    }
    if (validBuffers.length === 1) {
      return validBuffers[0];
    }

    try {
      const mergedDoc = await PDFDocument.create();

      for (const buffer of validBuffers) {
        try {
          const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
          const pages = await mergedDoc.copyPages(doc, doc.getPageIndices());
          for (const page of pages) {
            mergedDoc.addPage(page);
          }
        } catch (err: any) {
          logger.warn('Erro ao carregar página de PDF individual para mesclagem, continuando com as demais', {
            error: err.message,
          });
        }
      }

      if (mergedDoc.getPageCount() === 0) {
        return validBuffers[0];
      }

      const mergedBytes = await mergedDoc.save();
      return Buffer.from(mergedBytes);
    } catch (err: any) {
      logger.error('Erro geral ao mesclar PDFs:', { error: err.message });
      throw new Error(`Falha ao mesclar PDFs: ${err.message}`);
    }
  },
};


import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { logger } from './logger.js';

const require = createRequire(import.meta.url);

export async function extractDocumentContent(
  filePath: string,
  mimeType: string
): Promise<{ textContent?: string; base64Image?: string }> {
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Arquivo não encontrado no caminho: ${filePath}`);
    }

    // 1. Image types -> Base64 data URL for Vision API
    if (['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
      const buffer = fs.readFileSync(filePath);
      const b64 = buffer.toString('base64');
      return { base64Image: `data:${mimeType};base64,${b64}` };
    }

    // 2. PDF -> Extract text using pdf-parse or fallback to Vision screenshot
    if (mimeType === 'application/pdf') {
      let extractedText = '';
      try {
        const pdfParse = require('pdf-parse');
        const dataBuffer = fs.readFileSync(filePath);
        const data = await pdfParse(dataBuffer);
        if (data && data.text && data.text.trim().length > 0) {
          extractedText = data.text.trim();
          logger.info(`Texto extraído do PDF com sucesso (${extractedText.length} caracteres)`);
        }
      } catch (err: any) {
        logger.warn('pdf-parse falhou ao extrair texto do PDF', { error: err.message });
      }

      // If text extraction yielded good content (digital PDFs, email prints), return it
      if (extractedText.length >= 40) {
        return { textContent: extractedText };
      }

      // If text is short or empty (scanned ticket, flyer, pure graphic PDF), try extracting strings or render page with Puppeteer
      const buf = fs.readFileSync(filePath);
      const rawStrings = buf.toString('latin1').replace(/[^\x20-\x7E\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim();
      if (rawStrings.length > 250) {
        return { textContent: rawStrings.slice(0, 15000) };
      }

      // Puppeteer fallback for scanned/graphic PDF tickets
      try {
        const puppeteerModule = await import('puppeteer');
        const puppeteer = puppeteerModule.default || puppeteerModule;
        const browser = await puppeteer.launch({
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
        });
        const page = await browser.newPage();
        await page.setViewport({ width: 1200, height: 1600 });
        await page.goto(`file://${path.resolve(filePath)}`, { waitUntil: 'load', timeout: 15000 });
        const screenshotBuf = await page.screenshot({ type: 'png', fullPage: false });
        await browser.close();
        const b64 = Buffer.from(screenshotBuf).toString('base64');
        logger.info('PDF renderizado como imagem para Vision com sucesso');
        return { base64Image: `data:image/png;base64,${b64}`, textContent: extractedText || undefined };
      } catch (renderErr: any) {
        logger.warn('Renderização de PDF para imagem via Puppeteer não disponível:', { error: renderErr.message });
      }

      return { textContent: extractedText || rawStrings.slice(0, 10000) };
    }

    // 3. DOCX -> extract text from word/document.xml
    if (
      mimeType.includes('wordprocessingml') ||
      filePath.endsWith('.docx')
    ) {
      try {
        // Simple unzip or read
        const content = fs.readFileSync(filePath, 'latin1');
        // Extract XML text tags <w:t>...</w:t>
        const matches = content.match(/<w:t[^>]*>([^<]+)<\/w:t>/g);
        if (matches && matches.length > 0) {
          const docxText = matches
            .map(m => m.replace(/<[^>]+>/g, ''))
            .join(' ');
          return { textContent: docxText };
        }
      } catch (err: any) {
        logger.warn('Falha na extração de texto do DOCX:', { error: err.message });
      }
    }

    // 4. Default plain text fallback
    const raw = fs.readFileSync(filePath, 'utf-8');
    return { textContent: raw.slice(0, 12000) };
  } catch (err: any) {
    logger.error('Erro na extração de conteúdo do documento:', { error: err.message, filePath });
    return {};
  }
}

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

    // 2. PDF -> Extract text using pdf-parse or fallback
    if (mimeType === 'application/pdf') {
      try {
        const pdfParse = require('pdf-parse');
        const dataBuffer = fs.readFileSync(filePath);
        const data = await pdfParse(dataBuffer);
        if (data && data.text && data.text.trim().length > 0) {
          logger.info(`Texto extraído do PDF com sucesso (${data.text.trim().length} caracteres)`);
          return { textContent: data.text.trim() };
        }
      } catch (err: any) {
        logger.warn('pdf-parse falhou, tentando extração de strings brutas do PDF', { error: err.message });
      }

      // Fallback: extract ASCII/UTF-8 streams from PDF
      const buf = fs.readFileSync(filePath);
      const text = buf.toString('latin1').replace(/[^\x20-\x7E\n\r\t]/g, ' ');
      return { textContent: text.slice(0, 10000) };
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

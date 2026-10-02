import fs from 'fs';
import path from 'path';
import { query } from '../db/pool.js';
import { env } from '../config/env.js';
import { reportService } from './reportService.js';
import { pdfService } from './pdfService.js';
import { logger } from '../utils/logger.js';

interface GenerationResult {
  fullPath: string;
  anonPath: string;
  fullSizeBytes: number;
  anonSizeBytes: number;
}

class TripBookPdfService {
  private tripbooksDir: string;
  private activeGenerations = new Map<string, Promise<GenerationResult>>();
  private debounceTimers = new Map<string, NodeJS.Timeout>();

  constructor() {
    this.tripbooksDir = path.join(env.UPLOAD_PATH, 'tripbooks');
    this.ensureDirectory();
  }

  private ensureDirectory() {
    try {
      if (!fs.existsSync(this.tripbooksDir)) {
        fs.mkdirSync(this.tripbooksDir, { recursive: true });
      }
    } catch (err: any) {
      logger.error('Erro ao criar diretório de tripbooks:', { error: err.message });
    }
  }

  public getFullPdfPath(tripId: string): string {
    return path.join(this.tripbooksDir, `trip_${tripId}_full.pdf`);
  }

  public getAnonPdfPath(tripId: string): string {
    return path.join(this.tripbooksDir, `trip_${tripId}_anon.pdf`);
  }

  /**
   * Returns pre-generated PDF file path if valid and exists on disk.
   * Otherwise generates both versions, saves to disk, and returns the requested file path.
   */
  async getOrGeneratePdf(tripId: string, anonymize: boolean): Promise<string> {
    this.ensureDirectory();
    const targetPath = anonymize ? this.getAnonPdfPath(tripId) : this.getFullPdfPath(tripId);

    // Check DB status and file existence
    const { rows } = await query(
      `SELECT id, pdf_needs_generation, pdf_full_path, pdf_anon_path, 
              pdf_full_generated_at, pdf_anon_generated_at 
       FROM trips WHERE id = $1 AND deleted_at IS NULL`,
      [tripId]
    );

    if (rows.length === 0) {
      throw new Error('Viagem não encontrada');
    }

    const trip = rows[0];
    const fileExists = fs.existsSync(targetPath);

    // If file is fresh on disk and trip does not need regeneration, serve immediately
    if (fileExists && !trip.pdf_needs_generation) {
      return targetPath;
    }

    // Otherwise, generate (or wait for in-flight generation)
    const result = await this.generateBothPdfs(tripId);
    return anonymize ? result.anonPath : result.fullPath;
  }

  /**
   * Generates both Full (un-anonymized) and Anonymized PDFs for a trip.
   * Reuses in-flight promise if already generating for this tripId to prevent duplicate processes.
   */
  async generateBothPdfs(tripId: string): Promise<GenerationResult> {
    this.ensureDirectory();

    // Deduplicate in-flight requests for the same tripId
    const existing = this.activeGenerations.get(tripId);
    if (existing) {
      return existing;
    }

    const generationPromise = (async (): Promise<GenerationResult> => {
      logger.info('Iniciando pré-geração de PDFs do Trip Book...', { tripId });
      const startTime = Date.now();

      try {
        const data = await reportService.getTripBookData(tripId);

        // 1. Generate Full HTML & PDF (for members/organizers)
        const fullHtml = reportService.generateTripBookHtml(data, {
          anonymize: false,
          isPublicShare: false,
        });
        const fullBuffer = await pdfService.htmlToPdf(fullHtml);
        const fullPath = this.getFullPdfPath(tripId);
        fs.writeFileSync(fullPath, fullBuffer);

        // 2. Generate Anonymized HTML & PDF (for public shared links)
        const anonHtml = reportService.generateTripBookHtml(data, {
          anonymize: true,
          isPublicShare: false,
        });
        const anonBuffer = await pdfService.htmlToPdf(anonHtml);
        const anonPath = this.getAnonPdfPath(tripId);
        fs.writeFileSync(anonPath, anonBuffer);

        // 3. Update database record with metadata and reset needs_generation flag
        await query(
          `UPDATE trips 
           SET pdf_full_path = $1,
               pdf_full_generated_at = NOW(),
               pdf_full_size_bytes = $2,
               pdf_anon_path = $3,
               pdf_anon_generated_at = NOW(),
               pdf_anon_size_bytes = $4,
               pdf_needs_generation = FALSE
           WHERE id = $5`,
          [fullPath, fullBuffer.length, anonPath, anonBuffer.length, tripId]
        );

        const duration = Date.now() - startTime;
        logger.info('Pré-geração de PDFs concluída com sucesso!', {
          tripId,
          durationMs: duration,
          fullSize: fullBuffer.length,
          anonSize: anonBuffer.length,
        });

        return {
          fullPath,
          anonPath,
          fullSizeBytes: fullBuffer.length,
          anonSizeBytes: anonBuffer.length,
        };
      } catch (err: any) {
        logger.error('Falha na pré-geração de PDFs do Trip Book:', { tripId, error: err.message });
        throw err;
      } finally {
        this.activeGenerations.delete(tripId);
      }
    })();

    this.activeGenerations.set(tripId, generationPromise);
    return generationPromise;
  }

  /**
   * Debounced background queue to trigger pre-generation after edits.
   */
  queuePreGeneration(tripId: string, delayMs = 3000): void {
    if (!tripId) return;

    // Immediately flag in database that trip needs PDF regeneration
    query('UPDATE trips SET pdf_needs_generation = TRUE WHERE id = $1', [tripId]).catch(() => {});

    // Cancel existing debounce timer for this trip
    const existingTimer = this.debounceTimers.get(tripId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      this.debounceTimers.delete(tripId);
      this.generateBothPdfs(tripId).catch((err) => {
        logger.warn('Erro ao processar pré-geração agendada de PDF:', { tripId, error: err.message });
      });
    }, delayMs);

    this.debounceTimers.set(tripId, timer);
  }

  /**
   * Get PDF pre-generation status for a trip
   */
  async getPdfStatus(tripId: string) {
    const { rows } = await query(
      `SELECT pdf_full_path, pdf_full_generated_at, pdf_full_size_bytes,
              pdf_anon_path, pdf_anon_generated_at, pdf_anon_size_bytes,
              pdf_needs_generation
       FROM trips WHERE id = $1 AND deleted_at IS NULL`,
      [tripId]
    );

    if (rows.length === 0) return null;
    const r = rows[0];

    const fullExists = r.pdf_full_path ? fs.existsSync(r.pdf_full_path) : false;
    const anonExists = r.pdf_anon_path ? fs.existsSync(r.pdf_anon_path) : false;

    const formatBytes = (bytes?: number) => {
      if (!bytes) return null;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    return {
      hasPreGenerated: fullExists && anonExists,
      fullGeneratedAt: r.pdf_full_generated_at,
      anonGeneratedAt: r.pdf_anon_generated_at,
      fullSizeBytes: Number(r.pdf_full_size_bytes || 0),
      anonSizeBytes: Number(r.pdf_anon_size_bytes || 0),
      fullSizeFormatted: formatBytes(Number(r.pdf_full_size_bytes || 0)),
      anonSizeFormatted: formatBytes(Number(r.pdf_anon_size_bytes || 0)),
      needsRegeneration: Boolean(r.pdf_needs_generation) || !fullExists || !anonExists,
      isGenerating: this.activeGenerations.has(tripId),
    };
  }

  /**
   * Pre-generate pending PDFs for all active trips on startup or maintenance
   */
  async preGenerateAllPendingTrips(): Promise<void> {
    try {
      const { rows } = await query(
        `SELECT id, title FROM trips 
         WHERE deleted_at IS NULL 
           AND (pdf_needs_generation = TRUE OR pdf_full_path IS NULL OR pdf_anon_path IS NULL)
         ORDER BY updated_at DESC
         LIMIT 10`
      );

      if (rows.length === 0) return;

      logger.info(`Iniciando pré-geração de TripBooks em lote (${rows.length} viagens pendentes)...`);
      for (const trip of rows) {
        try {
          await this.generateBothPdfs(trip.id);
        } catch (e: any) {
          logger.warn(`Falha na pré-geração em lote para viagem ${trip.title}:`, { error: e.message });
        }
      }
      logger.info('Pré-geração em lote de TripBooks concluída!');
    } catch (err: any) {
      logger.error('Erro na pré-geração em lote de TripBooks:', { error: err.message });
    }
  }
}

export const tripBookPdfService = new TripBookPdfService();

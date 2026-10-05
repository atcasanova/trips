import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { query } from '../db/pool.js';
import { computeFileHash } from '../middleware/upload.js';
import { openaiService } from '../services/openaiService.js';
import { refreshItineraryLocations } from '../services/itineraryLocationService.js';
import { logger } from '../utils/logger.js';
import {
  areFlightsMatching,
  areHotelsMatching,
  areItineraryItemsMatching,
  extractPassengers,
  normalizeFlightNumber,
  normalizeText,
} from '../utils/aggregation.js';
import { applyConfirmedExtraction } from '../services/documentConfirmationService.js';

export const documentController = {
  // 1. List documents for a trip
  async listDocuments(req: Request, res: Response) {
    const { tripId } = req.params;

    try {
      const { rows: docs } = await query(
        `SELECT d.*, 
                e.id as extraction_id, e.detected_type, e.raw_extraction, e.normalized_data, 
                e.user_corrections, e.model_used, e.status as extraction_status,
                u.name as uploader_name,
                u.email as uploader_email
         FROM documents d
         LEFT JOIN document_ai_extractions e ON d.id = e.document_id
         LEFT JOIN users u ON d.user_id = u.id
         WHERE d.trip_id = $1 AND d.deleted_at IS NULL
         ORDER BY d.created_at DESC`,
        [tripId]
      );

      const formatted = docs.map((d: any) => ({
        id: d.id,
        trip_id: d.trip_id,
        user_id: d.user_id,
        uploader_name: d.uploader_name,
        uploader_email: d.uploader_email,
        original_name: d.original_name,
        internal_filename: d.internal_filename,
        mime_type: d.mime_type,
        file_size: d.file_size,
        file_hash: d.file_hash,
        category: d.category,
        ai_status: d.ai_status,
        notes: d.notes,
        created_at: d.created_at,
        extraction: d.extraction_id
          ? {
              id: d.extraction_id,
              detected_type: d.detected_type,
              raw_extraction: d.raw_extraction,
              normalized_data: d.normalized_data,
              user_corrections: d.user_corrections,
              model_used: d.model_used,
              status: d.extraction_status,
            }
          : null,
      }));

      return res.json({ documents: formatted });
    } catch (err: any) {
      logger.error('Erro ao listar documentos:', { error: err.message });
      return res.status(500).json({ error: 'Erro ao listar documentos' });
    }
  },

  // 2. Upload document & trigger AI interpretation
  async uploadDocument(req: Request, res: Response) {
    const { tripId } = req.params;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    }

    try {
      // Compute SHA-256 hash
      const fileHash = await computeFileHash(file.path);

      // Save document record in DB
      const { rows: docRows } = await query(
        `INSERT INTO documents (
          trip_id, user_id, original_name, internal_filename, storage_path,
          mime_type, file_size, file_hash, category, ai_status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'OTHER', 'PROCESSING')
        RETURNING *`,
        [
          tripId,
          req.user?.id || null,
          file.originalname,
          file.filename,
          file.path,
          file.mimetype,
          file.size,
          fileHash,
        ]
      );

      const doc = docRows[0];

      // Audit log
      await query(
        `INSERT INTO audit_logs (user_id, trip_id, action, entity_type, entity_id, metadata)
         VALUES ($1, $2, 'DOCUMENT_UPLOADED', 'DOCUMENT', $3, $4)`,
        [req.user?.id || null, tripId, doc.id, JSON.stringify({ fileName: file.originalname, size: file.size })]
      );

      // Run AI interpretation
      logger.info('Submetendo documento à interpretação por IA...', { docId: doc.id, fileName: file.originalname });
      
      const aiResult = await openaiService.processDocument({
        filePath: file.path,
        mimeType: file.mimetype,
        originalName: file.originalname,
        userId: req.user?.id,
        tripId,
        documentId: doc.id,
      });

      let extractionData = null;

      if (aiResult.success && aiResult.rawExtraction) {
        // Save extraction
        const { rows: extRows } = await query(
          `INSERT INTO document_ai_extractions (
            document_id, trip_id, detected_type, raw_extraction, normalized_data,
            model_used, duration_ms, status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'DRAFT')
          RETURNING *`,
          [
            doc.id,
            tripId,
            aiResult.detectedType,
            JSON.stringify(aiResult.rawExtraction),
            JSON.stringify(aiResult.normalizedData),
            aiResult.modelUsed,
            aiResult.durationMs,
          ]
        );

        extractionData = extRows[0];

        // Map detected type to document category
        let newCategory = 'OTHER';
        if (aiResult.detectedType === 'flight_reservation') newCategory = 'FLIGHT';
        else if (aiResult.detectedType === 'hotel_reservation') newCategory = 'HOTEL';
        else if (aiResult.detectedType === 'activity_ticket') newCategory = 'TICKET';
        else if (aiResult.detectedType === 'expense_receipt') newCategory = 'RECEIPT';

        await query(`UPDATE documents SET ai_status = 'COMPLETED', category = $1 WHERE id = $2`, [newCategory, doc.id]);
        doc.category = newCategory;
        doc.ai_status = 'COMPLETED';
      } else {
        await query(`UPDATE documents SET ai_status = $1 WHERE id = $2`, [
          openaiService.isConfigured() ? 'FAILED' : 'SKIPPED',
          doc.id,
        ]);
        doc.ai_status = openaiService.isConfigured() ? 'FAILED' : 'SKIPPED';
      }

      return res.status(201).json({
        document: {
          ...doc,
          extraction: extractionData,
        },
        aiResult,
      });
    } catch (err: any) {
      logger.error('Erro no upload de documento:', { error: err.message });
      return res.status(500).json({ error: 'Erro ao processar upload do documento' });
    }
  },

  // 2.5 Reprocess document with AI
  async reprocessDocument(req: Request, res: Response) {
    const { tripId, documentId } = req.params;

    try {
      const { rows } = await query(
        'SELECT * FROM documents WHERE id = $1 AND trip_id = $2 AND deleted_at IS NULL',
        [documentId, tripId]
      );

      if (rows.length === 0) {
        return res.status(404).json({ error: 'Documento não encontrado' });
      }

      const doc = rows[0];

      logger.info('Reprocessando documento com IA...', { docId: doc.id, fileName: doc.original_name });

      const aiResult = await openaiService.processDocument({
        filePath: doc.storage_path,
        mimeType: doc.mime_type,
        originalName: doc.original_name,
        userId: req.user?.id,
        tripId,
        documentId: doc.id,
      });

      let extractionData = null;

      if (aiResult.success && aiResult.rawExtraction) {
        await query('DELETE FROM document_ai_extractions WHERE document_id = $1', [doc.id]);

        const { rows: extRows } = await query(
          `INSERT INTO document_ai_extractions (
            document_id, trip_id, detected_type, raw_extraction, normalized_data,
            model_used, duration_ms, status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'DRAFT')
          RETURNING *`,
          [
            doc.id,
            tripId,
            aiResult.detectedType,
            JSON.stringify(aiResult.rawExtraction),
            JSON.stringify(aiResult.normalizedData),
            aiResult.modelUsed,
            aiResult.durationMs,
          ]
        );

        extractionData = extRows[0];

        let newCategory = 'OTHER';
        if (aiResult.detectedType === 'flight_reservation') newCategory = 'FLIGHT';
        else if (aiResult.detectedType === 'hotel_reservation') newCategory = 'HOTEL';
        else if (aiResult.detectedType === 'activity_ticket') newCategory = 'TICKET';
        else if (aiResult.detectedType === 'expense_receipt') newCategory = 'RECEIPT';

        await query(`UPDATE documents SET ai_status = 'COMPLETED', category = $1 WHERE id = $2`, [newCategory, doc.id]);
        doc.category = newCategory;
        doc.ai_status = 'COMPLETED';
      } else {
        await query(`UPDATE documents SET ai_status = 'FAILED' WHERE id = $1`, [doc.id]);
        doc.ai_status = 'FAILED';
      }

      return res.json({
        document: {
          ...doc,
          extraction: extractionData,
        },
        aiResult,
      });
    } catch (err: any) {
      logger.error('Erro ao reprocessar documento:', { error: err.message });
      return res.status(500).json({ error: 'Erro ao reprocessar documento com IA' });
    }
  },

  // 3. Confirm AI Extraction & create corresponding entity
  async confirmExtraction(req: Request, res: Response) {
    const { tripId, documentId } = req.params;
    const { confirmedType, normalizedData, userCorrections, travelerAssociations } = req.body;

    try {
      const { rows: docs } = await query('SELECT * FROM documents WHERE id = $1 AND trip_id = $2', [documentId, tripId]);
      if (docs.length === 0) return res.status(404).json({ error: 'Documento não encontrado' });

      await applyConfirmedExtraction({
        tripId,
        documentId,
        userId: req.user?.id || null,
        confirmedType,
        normalizedData,
        userCorrections,
        travelerAssociations,
      });

      // Record audit
      await query(
        `INSERT INTO audit_logs (user_id, trip_id, action, entity_type, entity_id, metadata)
         VALUES ($1, $2, 'AI_EXTRACTION_CONFIRMED', 'DOCUMENT', $3, $4)`,
        [req.user?.id, tripId, documentId, JSON.stringify({ confirmedType })]
      );

      return res.json({ message: 'Dados extraídos e confirmados com sucesso no sistema!' });
    } catch (err: any) {
      logger.error('Erro ao confirmar extração:', { error: err.message });
      return res.status(500).json({ error: 'Erro ao salvar dados confirmados' });
    }
  },

  // 4. View / Stream Document File Inline
  async viewDocument(req: Request, res: Response) {
    const { documentId } = req.params;

    try {
      const { rows } = await query('SELECT * FROM documents WHERE id = $1 AND deleted_at IS NULL', [documentId]);
      if (rows.length === 0) return res.status(404).json({ error: 'Documento não encontrado' });

      const doc = rows[0];
      if (!fs.existsSync(doc.storage_path)) {
        return res.status(404).json({ error: 'Arquivo físico não encontrado no servidor' });
      }

      res.setHeader('Content-Type', doc.mime_type);
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.original_name)}"`);
      const stream = fs.createReadStream(doc.storage_path);
      stream.pipe(res);
    } catch (err: any) {
      logger.error('Erro ao visualizar documento:', { error: err.message });
      return res.status(500).json({ error: 'Erro ao abrir arquivo' });
    }
  },

  // 5. Delete Document
  async deleteDocument(req: Request, res: Response) {
    const { tripId, documentId } = req.params;

    try {
      await query(`UPDATE documents SET deleted_at = NOW() WHERE id = $1 AND trip_id = $2`, [documentId, tripId]);
      return res.json({ message: 'Documento excluído com sucesso' });
    } catch (err: any) {
      return res.status(500).json({ error: 'Erro ao excluir documento' });
    }
  },
};

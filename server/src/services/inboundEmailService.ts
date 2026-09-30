import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { simpleParser, ParsedMail, Attachment } from 'mailparser';
import { query } from '../db/pool.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { openaiService } from './openaiService.js';
import { pdfService } from './pdfService.js';
import { pexelsService } from './pexelsService.js';
import { emailService } from './emailService.js';
import { applyConfirmedExtraction } from './documentConfirmationService.js';
import { normalizeText } from '../utils/aggregation.js';

interface UserRecord {
  id: string;
  name: string;
  email: string;
}

interface ExtractedTripInfo {
  reservationType: string;
  category: 'FLIGHT' | 'HOTEL' | 'EVENT' | 'RECEIPT' | 'OTHER';
  startDate: string | null;
  endDate: string | null;
  cities: string[];
  country: string | null;
  summaryTitle: string;
  rawSummary?: string;
  totalAmount?: number;
  currency?: string;
}

export interface InboundProcessResult {
  success: boolean;
  reason?: string;
  userId?: string;
  tripId?: string;
  tripTitle?: string;
  isNewTrip?: boolean;
  documentIds?: string[];
  processedCount?: number;
}

export const inboundEmailService = {
  // Main entry point for raw MIME buffer processing
  async processInboundEmail(rawEmailBuffer: Buffer): Promise<InboundProcessResult> {
    if (!rawEmailBuffer || rawEmailBuffer.length === 0) {
      logger.warn('Inbound email recebido vazio');
      return { success: false, reason: 'empty_payload' };
    }

    let parsed: ParsedMail;
    try {
      parsed = await simpleParser(rawEmailBuffer);
    } catch (err: any) {
      logger.error('Erro ao analisar MIME do e-mail com mailparser:', { error: err.message });
      return { success: false, reason: 'mime_parse_error' };
    }

    const fromAddress = parsed.from?.value?.[0]?.address?.toLowerCase().trim() || '';
    const fromName = parsed.from?.value?.[0]?.name || fromAddress;
    const subject = parsed.subject || 'Sem Assunto';

    logger.info('Inbound email recebido', {
      from: fromAddress,
      subject,
      attachmentsCount: parsed.attachments?.length || 0,
      hasHtml: Boolean(parsed.html),
      hasText: Boolean(parsed.text),
    });

    // 1. Identify User (Filter 1 - Sender)
    const user = await this.resolveSenderUser(parsed, fromAddress);

    if (!user) {
      logger.warn('Inbound email recebido de remetente desconhecido ou não registrado', { from: fromAddress });
      if (fromAddress && fromAddress.includes('@')) {
        await emailService.sendInboundUnknownSenderEmail(fromAddress);
      }
      return { success: false, reason: 'unknown_sender' };
    }

    logger.info('Remetente identificado com sucesso no sistema', { userId: user.id, email: user.email, name: user.name });

    // 2. Extract or Render Files
    const filesToProcess = await this.prepareFilesToProcess(parsed);

    if (filesToProcess.length === 0) {
      logger.warn('Nenhum documento ou conteúdo interpretável no e-mail recebido', { from: fromAddress, subject });
      return { success: false, reason: 'no_processable_files' };
    }

    const processedDocIds: string[] = [];
    let finalTrip: any = null;
    let finalIsNewTrip = false;
    let latestExtractedInfo: ExtractedTripInfo | null = null;

    // 3. Process each document file
    for (let fIdx = 0; fIdx < filesToProcess.length; fIdx++) {
      const file = filesToProcess[fIdx];

      logger.info(`Processando arquivo ${fIdx + 1}/${filesToProcess.length} com IA...`, {
        fileName: file.originalName,
        mimeType: file.mimeType,
        size: file.size,
      });

      // AI interpretation
      const aiResult = await openaiService.processDocument({
        filePath: file.filePath,
        mimeType: file.mimeType,
        originalName: file.originalName,
        userId: user.id,
      });

      if (!aiResult.success || !aiResult.rawExtraction) {
        logger.warn('IA não conseguiu extrair dados do arquivo', {
          fileName: file.originalName,
          error: aiResult.error,
        });
        continue;
      }

      // Analyze extracted data for dates, cities, and categories
      const tripInfo = this.extractTripMatchingInfo(aiResult);
      latestExtractedInfo = tripInfo;

      // Filter 2 & 3: Match with existing trip or auto-create if this is the first file,
      // or re-use existing matched/created trip for subsequent files in this email
      if (!finalTrip) {
        const matchResult = await this.matchOrCreateTrip(user, tripInfo);
        finalTrip = matchResult.trip;
        finalIsNewTrip = matchResult.isNewTrip;
      }

      // Save document record in DB
      const { rows: docRows } = await query(
        `INSERT INTO documents (
          trip_id, user_id, original_name, internal_filename, storage_path,
          mime_type, file_size, file_hash, category, ai_status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'COMPLETED')
        RETURNING *`,
        [
          finalTrip.id,
          user.id,
          file.originalName,
          path.basename(file.filePath),
          file.filePath,
          file.mimeType,
          file.size,
          file.fileHash,
          tripInfo.category,
        ]
      );

      const doc = docRows[0];
      processedDocIds.push(doc.id);

      // Save extraction record
      await query(
        `INSERT INTO document_ai_extractions (
          document_id, trip_id, detected_type, raw_extraction, normalized_data,
          model_used, duration_ms, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'CONFIRMED')
        RETURNING *`,
        [
          doc.id,
          finalTrip.id,
          aiResult.detectedType,
          JSON.stringify(aiResult.rawExtraction),
          JSON.stringify(aiResult.normalizedData),
          aiResult.modelUsed,
          aiResult.durationMs,
        ]
      );

      // Apply confirmed extraction to database entities (flights, hotels, itinerary items, expenses)
      await applyConfirmedExtraction({
        tripId: finalTrip.id,
        documentId: doc.id,
        userId: user.id,
        confirmedType: aiResult.detectedType,
        normalizedData: aiResult.normalizedData,
      });

      // Audit log
      await query(
        `INSERT INTO audit_logs (user_id, trip_id, action, entity_type, entity_id, metadata)
         VALUES ($1, $2, 'INBOUND_EMAIL_DOCUMENT_PROCESSED', 'DOCUMENT', $3, $4)`,
        [
          user.id,
          finalTrip.id,
          doc.id,
          JSON.stringify({
            detectedType: aiResult.detectedType,
            fileName: file.originalName,
            isNewTrip: finalIsNewTrip,
          }),
        ]
      );

      logger.info('Documento de inbound processado e confirmado com sucesso', {
        docId: doc.id,
        tripId: finalTrip.id,
        tripTitle: finalTrip.title,
      });
    }

    if (processedDocIds.length === 0 || !finalTrip) {
      return { success: false, reason: 'extraction_failed_for_all_files' };
    }

    // 4. Send Confirmation Notification Email to User
    const itemSummary =
      latestExtractedInfo?.summaryTitle ||
      latestExtractedInfo?.rawSummary ||
      subject.replace(/^(fwd|enc|re):\s*/i, '').trim();

    const typeLabelMap: Record<string, string> = {
      FLIGHT: '✈️ Passagem Aérea',
      HOTEL: '🏨 Reserva de Hospedagem',
      EVENT: '🎟️ Ingresso / Evento',
      RECEIPT: '🧾 Despesa / Recibo',
      OTHER: '📋 Confirmação de Reserva',
    };

    const itemTypeLabel = typeLabelMap[latestExtractedInfo?.category || 'OTHER'] || '📋 Reserva';

    await emailService.sendInboundProcessedEmail({
      to: user.email,
      userName: user.name,
      tripId: finalTrip.id,
      tripTitle: finalTrip.title,
      itemSummary,
      itemTypeLabel,
      isNewTrip: finalIsNewTrip,
    });

    return {
      success: true,
      userId: user.id,
      tripId: finalTrip.id,
      tripTitle: finalTrip.title,
      isNewTrip: finalIsNewTrip,
      documentIds: processedDocIds,
      processedCount: processedDocIds.length,
    };
  },

  // Resolve sender by evaluating direct From, headers, or body text patterns
  async resolveSenderUser(parsed: ParsedMail, directFrom: string): Promise<UserRecord | null> {
    if (directFrom) {
      const { rows } = await query(
        `SELECT id, name, email FROM users WHERE LOWER(email) = LOWER($1) AND status = 'ACTIVE'`,
        [directFrom]
      );
      if (rows.length > 0) return rows[0];
    }

    // Check Reply-To
    const replyTo = parsed.replyTo?.value?.[0]?.address?.toLowerCase().trim();
    if (replyTo && replyTo !== directFrom) {
      const { rows } = await query(
        `SELECT id, name, email FROM users WHERE LOWER(email) = LOWER($1) AND status = 'ACTIVE'`,
        [replyTo]
      );
      if (rows.length > 0) return rows[0];
    }

    // Check Resent-From or X-Forwarded-For headers
    const resentFromHeader = parsed.headers?.get('resent-from');
    if (typeof resentFromHeader === 'string' && resentFromHeader.includes('@')) {
      const match = resentFromHeader.match(/<([^>]+)>/) || [null, resentFromHeader.trim()];
      if (match[1]) {
        const { rows } = await query(
          `SELECT id, name, email FROM users WHERE LOWER(email) = LOWER($1) AND status = 'ACTIVE'`,
          [match[1].toLowerCase()]
        );
        if (rows.length > 0) return rows[0];
      }
    }

    // Search body text for forwarded user patterns (e.g. "De: Fulano <fulano@email.com>")
    const bodyText = (parsed.text || '') + (parsed.html || '');
    const emailMatches = bodyText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
    if (emailMatches && emailMatches.length > 0) {
      const candidates = Array.from(new Set(emailMatches.map((e) => e.toLowerCase()))).slice(0, 10);
      const { rows } = await query(
        `SELECT id, name, email FROM users WHERE LOWER(email) = ANY($1) AND status = 'ACTIVE' LIMIT 1`,
        [candidates]
      );
      if (rows.length > 0) return rows[0];
    }

    return null;
  },

  // Prepare attachments or convert HTML/text email body to PDF
  async prepareFilesToProcess(parsed: ParsedMail): Promise<Array<{
    filePath: string;
    originalName: string;
    mimeType: string;
    size: number;
    fileHash: string;
  }>> {
    const validFiles: Array<{
      filePath: string;
      originalName: string;
      mimeType: string;
      size: number;
      fileHash: string;
    }> = [];

    // Ensure upload dir exists
    if (!fs.existsSync(env.UPLOAD_PATH)) {
      fs.mkdirSync(env.UPLOAD_PATH, { recursive: true });
    }

    const allowedMimes = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/vnd.apple.pkpass',
      'application/octet-stream',
    ];

    const allowedExts = ['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.pkpass'];

    // 1. Process valid attachments
    if (Array.isArray(parsed.attachments) && parsed.attachments.length > 0) {
      for (const att of parsed.attachments) {
        const filename = att.filename || `anexo-${Date.now()}`;
        const ext = path.extname(filename).toLowerCase();
        const contentType = att.contentType?.toLowerCase() || '';

        const isAllowed =
          allowedMimes.includes(contentType) ||
          allowedExts.includes(ext);

        if (isAllowed && att.content && att.content.length > 500) {
          const uniqueName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext || '.pdf'}`;
          const savePath = path.join(env.UPLOAD_PATH, uniqueName);

          fs.writeFileSync(savePath, att.content);
          const hash = crypto.createHash('sha256').update(att.content).digest('hex');

          let normalizedMime = att.contentType || 'application/pdf';
          if (ext === '.pdf') normalizedMime = 'application/pdf';
          else if (ext === '.jpg' || ext === '.jpeg') normalizedMime = 'image/jpeg';
          else if (ext === '.png') normalizedMime = 'image/png';
          else if (ext === '.webp') normalizedMime = 'image/webp';

          validFiles.push({
            filePath: savePath,
            originalName: filename,
            mimeType: normalizedMime,
            size: att.size || att.content.length,
            fileHash: hash,
          });
        }
      }
    }

    // 2. If no valid attachments, render the email body (HTML or plain text) as a PDF
    if (validFiles.length === 0 && (parsed.html || parsed.text)) {
      try {
        logger.info('Nenhum anexo suportado encontrado. Renderizando corpo do e-mail em PDF...');
        const emailSubject = parsed.subject || 'Confirmação de Reserva';
        const emailSender = parsed.from?.text || 'Remetente';
        const emailDate = parsed.date ? parsed.date.toLocaleDateString('pt-BR') : '';

        const bodyContent = parsed.html || `<pre style="white-space: pre-wrap; font-family: sans-serif;">${parsed.text || ''}</pre>`;

        const fullHtml = `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <style>
                body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 24px; color: #1e293b; }
                .email-header { margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #e2e8f0; }
                .email-title { font-size: 20px; font-weight: bold; color: #0f172a; margin-bottom: 6px; }
                .email-meta { font-size: 13px; color: #64748b; }
                .email-content { font-size: 14px; line-height: 1.6; }
                img { max-width: 100%; height: auto; }
                table { width: 100%; border-collapse: collapse; }
              </style>
            </head>
            <body>
              <div class="email-header">
                <div class="email-title">${escapeHtml(emailSubject)}</div>
                <div class="email-meta">De: ${escapeHtml(emailSender)} ${emailDate ? `| Data: ${emailDate}` : ''}</div>
              </div>
              <div class="email-content">
                ${bodyContent}
              </div>
            </body>
          </html>
        `;

        const pdfBuffer = await pdfService.htmlToPdf(fullHtml);
        const uniqueName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}.pdf`;
        const savePath = path.join(env.UPLOAD_PATH, uniqueName);

        fs.writeFileSync(savePath, pdfBuffer);
        const hash = crypto.createHash('sha256').update(pdfBuffer).digest('hex');

        validFiles.push({
          filePath: savePath,
          originalName: `${cleanSubjectForFilename(emailSubject)}.pdf`,
          mimeType: 'application/pdf',
          size: pdfBuffer.length,
          fileHash: hash,
        });
      } catch (pdfErr: any) {
        logger.error('Erro ao converter corpo de e-mail em PDF:', { error: pdfErr.message });
      }
    }

    return validFiles;
  },

  // Extract structured travel info from AI extraction for matching and auto-creation
  extractTripMatchingInfo(aiResult: any): ExtractedTripInfo {
    const raw = aiResult.rawExtraction || {};
    const norm = aiResult.normalizedData || {};
    const detectedType = aiResult.detectedType || raw.documentType || 'other';

    let category: 'FLIGHT' | 'HOTEL' | 'EVENT' | 'RECEIPT' | 'OTHER' = 'OTHER';
    let startDate: string | null = null;
    let endDate: string | null = null;
    const cities: string[] = [];
    let country: string | null = null;
    let summaryTitle = raw.summary || 'Reserva';
    const rawSummary = raw.summary;

    if (detectedType === 'flight_reservation') {
      category = 'FLIGHT';
      const segments = Array.isArray(norm.segments) ? norm.segments : [];
      if (segments.length > 0) {
        // Collect dates
        const dates: string[] = [];
        for (const s of segments) {
          if (s.departureDate) dates.push(s.departureDate);
          if (s.arrivalDate) dates.push(s.arrivalDate);
        }
        dates.sort();
        if (dates.length > 0) {
          startDate = dates[0];
          endDate = dates[dates.length - 1];
        }

        // Collect destination cities (arrival cities, excluding origin of the journey)
        const originCity = segments[0]?.departureCity;
        for (const s of segments) {
          if (s.arrivalCity) {
            const isOrigin = originCity && normalizeText(s.arrivalCity) === normalizeText(originCity);
            if (!isOrigin && !cities.includes(s.arrivalCity)) {
              cities.push(s.arrivalCity);
            }
          }
        }
        if (cities.length === 0 && segments[0]?.arrivalCity) {
          cities.push(segments[0].arrivalCity);
        }

        const destCity = cities[0] || segments[0]?.arrivalAirport || 'Destino';
        summaryTitle = `Voo para ${destCity}${norm.airline ? ` (${norm.airline})` : ''}`;
      }
    } else if (detectedType === 'hotel_reservation') {
      category = 'HOTEL';
      startDate = norm.checkInDate || null;
      endDate = norm.checkOutDate || startDate;
      if (norm.city) cities.push(norm.city);
      if (norm.country) country = norm.country;
      summaryTitle = `Hospedagem: ${norm.hotelName || norm.city || 'Hotel'}`;
    } else if (detectedType === 'activity_ticket') {
      category = 'EVENT';
      startDate = norm.eventDate || null;
      endDate = norm.eventDate || null;
      if (norm.city) cities.push(norm.city);
      if (norm.country) country = norm.country;
      summaryTitle = `Ingresso: ${norm.title || norm.activityName || norm.venueName || 'Evento'}`;
    } else if (detectedType === 'transport_other') {
      category = 'FLIGHT';
      startDate = norm.departureDate || null;
      endDate = norm.arrivalDate || startDate;
      if (norm.arrivalCity) cities.push(norm.arrivalCity);
      if (norm.departureCity && !cities.includes(norm.departureCity)) cities.push(norm.departureCity);
      summaryTitle = `Transporte: ${norm.operator || norm.transportType || 'Transfer'}`;
    } else if (detectedType === 'expense_receipt') {
      category = 'RECEIPT';
      startDate = norm.date || null;
      endDate = norm.date || null;
      if (norm.city) cities.push(norm.city);
      summaryTitle = `Despesa: ${norm.merchantName || 'Recibo'}`;
    }

    return {
      reservationType: detectedType,
      category,
      startDate,
      endDate,
      cities,
      country,
      summaryTitle,
      rawSummary,
      totalAmount: norm.totalAmount ? parseFloat(norm.totalAmount) : undefined,
      currency: norm.currency,
    };
  },

  // Match existing user trip by dates & city, or auto-create a new trip (Filters 2 & 3)
  async matchOrCreateTrip(user: UserRecord, info: ExtractedTripInfo): Promise<{ trip: any; isNewTrip: boolean }> {
    // Fetch all active trips where the user is a member
    const { rows: trips } = await query(
      `SELECT t.* FROM trips t
       JOIN trip_members tm ON t.id = tm.trip_id
       WHERE tm.user_id = $1 AND t.deleted_at IS NULL
       ORDER BY t.created_at DESC`,
      [user.id]
    );

    let bestTrip: any = null;
    let highestScore = 0;

    const normCandidateCities = info.cities.map((c) => normalizeText(c));

    for (const trip of trips) {
      let score = 0;

      // 1. Date Match (Check if reservation belongs to this trip's timeframe)
      if (trip.start_date && info.startDate) {
        const tStart = new Date(trip.start_date).getTime();
        const tEnd = trip.end_date ? new Date(trip.end_date).getTime() : tStart;
        const rStart = new Date(info.startDate).getTime();
        const rEnd = info.endDate ? new Date(info.endDate).getTime() : rStart;

        const dayMs = 24 * 60 * 60 * 1000;
        // 3-day buffer on boundaries
        const bufferStart = tStart - 3 * dayMs;
        const bufferEnd = tEnd + 3 * dayMs;

        const isExactMatch = tStart === rStart;
        const isContained = rStart >= bufferStart && rEnd <= bufferEnd;
        const isOverlapping = rStart <= bufferEnd && rEnd >= bufferStart;

        if (isExactMatch) {
          score += 120;
        } else if (isContained) {
          score += 100;
        } else if (isOverlapping) {
          score += 70;
        } else {
          // The reservation is outside this trip's timeframe -> skip!
          continue;
        }
      }

      // 2. City Match
      let cityMatched = false;
      const tripCities: string[] = Array.isArray(trip.cities)
        ? trip.cities
        : typeof trip.cities === 'string'
        ? JSON.parse(trip.cities || '[]')
        : [];

      for (const tc of tripCities) {
        const normTc = normalizeText(tc);
        if (normCandidateCities.some((cc) => cc.includes(normTc) || normTc.includes(cc))) {
          cityMatched = true;
          score += 100;
          break;
        }
      }

      if (!cityMatched && trip.title) {
        const normTitle = normalizeText(trip.title);
        if (normCandidateCities.some((cc) => normTitle.includes(cc))) {
          cityMatched = true;
          score += 80;
        }
      }

      if (!cityMatched && trip.destination_summary) {
        const normDest = normalizeText(trip.destination_summary);
        if (normCandidateCities.some((cc) => normDest.includes(cc))) {
          cityMatched = true;
          score += 60;
        }
      }

      // If the trip has no dates set yet, but city matches
      if (!trip.start_date && cityMatched) {
        score += 50;
      }

      if (score > highestScore) {
        highestScore = score;
        bestTrip = trip;
      }
    }

    // Match threshold: score >= 100 means either:
    // (A) Strong city match + overlapping/contained dates (score >= 170)
    // (B) Contained dates on a trip (score >= 100)
    // (C) Exact city match on trip (score >= 100)
    if (bestTrip && highestScore >= 100) {
      logger.info('Viagem existente encontrada por correspondência de data/cidade', {
        tripId: bestTrip.id,
        title: bestTrip.title,
        score: highestScore,
      });

      // Expand trip dates if reservation extends beyond current trip bounds
      if (info.startDate && bestTrip.start_date) {
        const tStart = new Date(bestTrip.start_date);
        const rStart = new Date(info.startDate);
        const tEnd = bestTrip.end_date ? new Date(bestTrip.end_date) : tStart;
        const rEnd = info.endDate ? new Date(info.endDate) : rStart;

        let needsDateUpdate = false;
        let newStart = bestTrip.start_date;
        let newEnd = bestTrip.end_date;

        if (rStart < tStart) {
          newStart = info.startDate;
          needsDateUpdate = true;
        }
        if (rEnd > tEnd) {
          newEnd = info.endDate || info.startDate;
          needsDateUpdate = true;
        }

        if (needsDateUpdate) {
          await query(`UPDATE trips SET start_date = $1, end_date = $2, updated_at = NOW() WHERE id = $3`, [
            newStart,
            newEnd,
            bestTrip.id,
          ]);
          bestTrip.start_date = newStart;
          bestTrip.end_date = newEnd;
          logger.info(`Datas da viagem ${bestTrip.title} atualizadas para acomodar a reserva: ${newStart} até ${newEnd}`);
        }
      }

      // Add city to trip.cities if missing
      if (info.cities.length > 0) {
        const tripCities: string[] = Array.isArray(bestTrip.cities)
          ? bestTrip.cities
          : typeof bestTrip.cities === 'string'
          ? JSON.parse(bestTrip.cities || '[]')
          : [];

        let citiesUpdated = false;
        for (const c of info.cities) {
          if (!tripCities.some((tc) => normalizeText(tc) === normalizeText(c))) {
            tripCities.push(c);
            citiesUpdated = true;
          }
        }

        if (citiesUpdated) {
          await query(`UPDATE trips SET cities = $1, updated_at = NOW() WHERE id = $2`, [
            JSON.stringify(tripCities),
            bestTrip.id,
          ]);
          bestTrip.cities = tripCities;
        }
      }

      return { trip: bestTrip, isNewTrip: false };
    }

    // Filter 3: No existing trip matches the period/city -> Automatically create a new trip!
    logger.info('Nenhuma viagem correspondente encontrada. Criando nova viagem automaticamente...', {
      cities: info.cities,
      startDate: info.startDate,
      endDate: info.endDate,
    });

    const primaryCity = info.cities[0] || 'Viagem';
    const tripTitle = info.cities.length > 0 ? `Viagem para ${primaryCity}` : (info.summaryTitle || 'Minha Viagem');
    const startDate = info.startDate || new Date().toISOString().split('T')[0];
    const endDate = info.endDate || startDate;

    // Search Pexels cover photo for the destination city
    let coverUrl: string | null = null;
    let coverThumb: string | null = null;
    let coverAttribution: any = null;

    if (info.cities.length > 0) {
      try {
        const photoResults = await pexelsService.searchPhotos(primaryCity, 1);
        if (photoResults.photos.length > 0) {
          const photo = photoResults.photos[0];
          coverUrl = photo.src.large2x || photo.src.large || photo.src.original;
          coverThumb = photo.src.medium || photo.src.small;
          coverAttribution = {
            photographer: photo.photographer,
            photographerUrl: photo.photographer_url,
            pexelsUrl: photo.url,
          };
        }
      } catch (err: any) {
        logger.warn('Falha ao buscar foto no Pexels para nova viagem:', { error: err.message, city: primaryCity });
      }
    }

    const defaultTheme = {
      preset: 'ocean',
      primary: '#1e40af',
      secondary: '#3b82f6',
      accent: '#eff6ff',
      text: '#1e293b',
    };

    const { rows: newTripRows } = await query(
      `INSERT INTO trips (
        title, destination_summary, start_date, end_date, primary_country,
        cities, timezone, status, theme, cover_image_url, cover_image_thumb,
        cover_image_attribution, default_currency, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, 'UTC', 'CONFIRMED', $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [
        tripTitle,
        info.summaryTitle || null,
        startDate,
        endDate,
        info.country || null,
        JSON.stringify(info.cities),
        JSON.stringify(defaultTheme),
        coverUrl,
        coverThumb,
        coverAttribution ? JSON.stringify(coverAttribution) : null,
        info.currency || 'BRL',
        user.id,
      ]
    );

    const newTrip = newTripRows[0];

    // Add user as OWNER in trip_members and trip_travelers
    await query(
      `INSERT INTO trip_members (trip_id, user_id, role) VALUES ($1, $2, 'OWNER')`,
      [newTrip.id, user.id]
    );

    await query(
      `INSERT INTO trip_travelers (trip_id, user_id, display_name, email, role, created_by)
       VALUES ($1, $2, $3, $4, 'OWNER', $5)
       ON CONFLICT (trip_id, user_id) WHERE user_id IS NOT NULL DO NOTHING`,
      [newTrip.id, user.id, user.name, user.email, user.id]
    );

    // Audit log
    await query(
      `INSERT INTO audit_logs (user_id, trip_id, action, entity_type, entity_id, metadata)
       VALUES ($1, $2, 'TRIP_AUTO_CREATED_FROM_INBOUND', 'TRIP', $3, $4)`,
      [
        user.id,
        newTrip.id,
        newTrip.id,
        JSON.stringify({
          source: 'inbound_email',
          city: primaryCity,
          startDate,
          endDate,
        }),
      ]
    );

    logger.info('Nova viagem criada automaticamente com sucesso', {
      tripId: newTrip.id,
      title: newTrip.title,
      owner: user.email,
    });

    return { trip: newTrip, isNewTrip: true };
  },
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function cleanSubjectForFilename(subject: string): string {
  return subject
    .replace(/^(fwd|enc|re):\s*/gi, '')
    .replace(/[^\w\s\u00C0-\u00FF-]/gi, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 50) || 'reserva';
}

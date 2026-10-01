/**
 * Utilitários de agregação para voos, hotéis e itens de roteiro.
 * Consolida dados enviados por múltiplos viajantes com datas/horários coincidentes.
 */

export interface AggregatedPassenger {
  name: string;
  seat?: string | null;
  bookingCode?: string | null;
  ticketNumber?: string | null;
  ticketName?: string | null;
  travelerId?: string | null;
}

export interface DocumentRef {
  id: string;
  document_id?: string;
  original_name?: string;
  mime_type?: string;
  file_size?: number;
}

/** Normaliza número de voo para comparação (remove espaços e hífens, uppercase) */
export function normalizeFlightNumber(num?: string | null): string {
  if (!num) return '';
  return String(num).replace(/[\s-]/g, '').toUpperCase().trim();
}

/** Normaliza texto geral para busca aproximada (remove acentos, pontuações, emojis) */
export function normalizeText(text?: string | null): string {
  if (!text) return '';
  return String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Extrai lista estruturada de passageiros de passenger_names (JSONB ou array) */
export function extractPassengers(val: any, fallbackNames: string[] = []): AggregatedPassenger[] {
  if (!val) {
    return fallbackNames.map((n) => ({ name: n }));
  }

  let parsed = val;
  if (typeof val === 'string') {
    try {
      parsed = JSON.parse(val);
    } catch {
      return val
        .split(/[,;\n]/)
        .map((s: string) => s.trim())
        .filter(Boolean)
        .map((name: string) => ({ name }));
    }
  }

  if (Array.isArray(parsed)) {
    const result: AggregatedPassenger[] = [];
    for (const item of parsed) {
      if (typeof item === 'string') {
        const trimmed = item.trim();
        if (trimmed) result.push({ name: trimmed });
      } else if (item && typeof item === 'object') {
        const name = (item.name || item.displayName || item.ticketName || '').trim();
        if (name) {
          result.push({
            name,
            seat: item.seat || null,
            bookingCode: item.bookingCode || null,
            ticketNumber: item.ticketNumber || null,
            ticketName: item.ticketName || null,
            travelerId: item.travelerId || null,
          });
        }
      }
    }
    if (result.length > 0) return result;
  }

  return fallbackNames.map((n) => ({ name: n }));
}

/** Verifica se dois trechos de transporte representam o mesmo voo/deslocamento */
export function areFlightsMatching(f1: any, f2: any): boolean {
  if (!f1 || !f2) return false;

  // Trecho apenas de pouso no dia seguinte não deve ser mesclado com trecho de partida
  if (Boolean(f1.isArrivalOnly) !== Boolean(f2.isArrivalOnly)) return false;

  // Datas devem coincidir
  const d1 = f1.departure_date || f1.arrival_date;
  const d2 = f2.departure_date || f2.arrival_date;
  if (d1 && d2 && d1 !== d2) return false;

  const fn1 = normalizeFlightNumber(f1.identification_number);
  const fn2 = normalizeFlightNumber(f2.identification_number);

  // Se ambos têm número de voo, a igualdade dele define o match
  if (fn1 && fn2) {
    if (fn1 === fn2) return true;
  }

  // Se não houver número exato ou coincidente, compara horário de partida e rota
  const t1 = f1.departure_time ? f1.departure_time.slice(0, 5) : null;
  const t2 = f2.departure_time ? f2.departure_time.slice(0, 5) : null;

  if (t1 && t2 && t1 === t2) {
    const loc1 = normalizeText(f1.departure_station_code || f1.departure_location);
    const loc2 = normalizeText(f2.departure_station_code || f2.departure_location);
    if (loc1 && loc2 && (loc1.includes(loc2) || loc2.includes(loc1))) {
      return true;
    }
  }

  return false;
}

/** Agrega segmentos de voos/transportes de um dia ou da viagem */
export function aggregateFlightSegments(
  segments: any[],
  options?: { anonymize?: boolean; fallbackTravelers?: string[] }
): any[] {
  if (!Array.isArray(segments) || segments.length === 0) return [];

  const groups: any[][] = [];

  for (const seg of segments) {
    let foundGroup = false;
    for (const group of groups) {
      if (areFlightsMatching(group[0], seg)) {
        group.push(seg);
        foundGroup = true;
        break;
      }
    }
    if (!foundGroup) {
      groups.push([seg]);
    }
  }

  return groups.map((group) => {
    const base = { ...group[0] };

    // Agrega todos os passageiros sem duplicação de nome
    const allPax: AggregatedPassenger[] = [];
    const seenNames = new Set<string>();

    for (const seg of group) {
      const paxes = extractPassengers(seg.passenger_names, options?.fallbackTravelers || []);
      for (const p of paxes) {
        const norm = normalizeText(p.name);
        if (!seenNames.has(norm)) {
          seenNames.add(norm);
          allPax.push(p);
        } else {
          // Atualiza assento se o passageiro já existir mas faltava assento
          const existing = allPax.find((ep) => normalizeText(ep.name) === norm);
          if (existing && !existing.seat && p.seat) {
            existing.seat = p.seat;
          }
        }
      }
    }

    const paxNames = options?.anonymize
      ? allPax.length > 1
        ? [`${allPax.length} passageiros`]
        : ['Viajante']
      : allPax.map((p) => p.name);

    // Formatação detalhada com assentos
    const formattedPaxDetails = options?.anonymize
      ? allPax.length > 1
        ? `${allPax.length} passageiros`
        : 'Viajante'
      : allPax
          .map((p) => (p.seat ? `${p.name} (Assento: ${p.seat})` : p.name))
          .join(', ');

    // Coleta todos os assentos
    const seats = group
      .map((s) => s.seat)
      .concat(allPax.map((p) => p.seat))
      .filter((s): s is string => Boolean(s && String(s).trim()))
      .filter((v, i, a) => a.indexOf(v) === i);

    return {
      ...base,
      passenger_names: allPax,
      passengerNames: paxNames,
      passengersDetail: allPax,
      passengersFormatted: formattedPaxDetails,
      passengerCount: allPax.length,
      seat: seats.join(', ') || base.seat || null,
      aggregatedCount: group.length,
    };
  });
}

/** Verifica se duas reservas de hotel representam a mesma hospedagem */
export function areHotelsMatching(h1: any, h2: any): boolean {
  if (!h1 || !h2) return false;

  const in1 = h1.check_in_date;
  const in2 = h2.check_in_date;
  const out1 = h1.check_out_date || in1;
  const out2 = h2.check_out_date || in2;

  // Verifica se o intervalo de hospedagem se sobrepõe ou coincide
  const overlaps = in1 <= out2 && in2 <= out1;
  if (!overlaps) return false;

  const n1 = normalizeText(h1.hotel_name);
  const n2 = normalizeText(h2.hotel_name);

  if (n1 && n2) {
    if (n1 === n2 || n1.includes(n2) || n2.includes(n1)) return true;
  }

  // Compara endereço se disponível
  const a1 = normalizeText(h1.address);
  const a2 = normalizeText(h2.address);
  if (a1 && a2 && (a1.includes(a2) || a2.includes(a1))) return true;

  return false;
}

/** Agrega reservas de hotel */
export function aggregateHotels(hotels: any[], options?: { anonymize?: boolean }): any[] {
  if (!Array.isArray(hotels) || hotels.length === 0) return [];

  const groups: any[][] = [];

  for (const h of hotels) {
    let found = false;
    for (const g of groups) {
      if (areHotelsMatching(g[0], h)) {
        g.push(h);
        found = true;
        break;
      }
    }
    if (!found) {
      groups.push([h]);
    }
  }

  return groups.map((group) => {
    const base = { ...group[0] };

    // Agrega nomes dos hóspedes
    const allGuests: string[] = [];
    const seenGuests = new Set<string>();

    for (const h of group) {
      if (h.guest_names) {
        const list = String(h.guest_names)
          .split(/[,;\n]/)
          .map((s) => s.trim())
          .filter(Boolean);
        for (const g of list) {
          const norm = normalizeText(g);
          if (!seenGuests.has(norm)) {
            seenGuests.add(norm);
            allGuests.push(g);
          }
        }
      }
    }

    const guestCount = allGuests.length || group.length;
    const guestNamesFormatted = options?.anonymize
      ? guestCount > 1
        ? `${guestCount} hóspedes`
        : 'Viajante'
      : allGuests.join(', ') || base.guest_names || 'Viajantes';

    // Agrega números de reserva
    const resNumbers = group
      .map((h) => h.reservation_number)
      .filter((r): r is string => Boolean(r && String(r).trim()))
      .filter((v, i, a) => a.indexOf(v) === i);

    return {
      ...base,
      guest_names: guestNamesFormatted,
      guestNamesFormatted,
      guestCount,
      guestList: allGuests,
      reservation_number: resNumbers.join(', ') || base.reservation_number || null,
      aggregatedCount: group.length,
    };
  });
}

/** Extrai palavras-chave essenciais de um título para comparação semântica */
function getTitleKeywords(title?: string | null): string[] {
  if (!title) return [];
  const stopWords = new Set(['show', 'ingresso', 'tour', 'em', 'de', 'da', 'do', 'na', 'no', 'a', 'o', 'e', 'para', 'com']);
  return normalizeText(title)
    .split(' ')
    .filter((w) => w.length > 2 && !stopWords.has(w));
}

/** Verifica se dois itens de roteiro no mesmo dia representam a mesma atração/evento */
export function areItineraryItemsMatching(i1: any, i2: any): boolean {
  if (!i1 || !i2) return false;

  // Mesmo dia
  if (i1.trip_day_id && i2.trip_day_id && i1.trip_day_id !== i2.trip_day_id) {
    return false;
  }

  const n1 = normalizeText(i1.title);
  const n2 = normalizeText(i2.title);

  // Título idêntico
  if (n1 === n2) return true;

  // Se ambos contêm palavras-chave relevantes idênticas (ex: "foo fighters", "sensoji", "universal")
  const kw1 = getTitleKeywords(i1.title);
  const kw2 = getTitleKeywords(i2.title);
  const commonKw = kw1.filter((k) => kw2.includes(k));

  if (commonKw.length >= 2 || (commonKw.length === 1 && commonKw[0].length >= 5)) {
    // Horário igual ou não especificado
    const t1 = i1.start_time ? i1.start_time.slice(0, 5) : null;
    const t2 = i2.start_time ? i2.start_time.slice(0, 5) : null;
    if (!t1 || !t2 || t1 === t2) {
      return true;
    }
  }

  // Mesmo horário e mesmo local
  if (i1.start_time && i2.start_time && i1.start_time.slice(0, 5) === i2.start_time.slice(0, 5)) {
    const loc1 = normalizeText(i1.location_name || i1.address);
    const loc2 = normalizeText(i2.location_name || i2.address);
    if (loc1 && loc2 && (loc1.includes(loc2) || loc2.includes(loc1))) {
      return true;
    }
  }

  return false;
}

/** Extrai titulares / participantes de campos de texto de dicas/notas */
export function extractAttendeesFromItem(item: any): string[] {
  const attendees: string[] = [];
  const seen = new Set<string>();

  const texts = [item.tips, item.notes].filter(Boolean).join('\n');
  if (!texts) return [];

  // Padrões como: "Titular: Fulano", "Participante: Ciclano", "Ingressos: Beltrano"
  const regexes = [
    /Titular:\s*([^|\n,;]+)/gi,
    /Participante:\s*([^|\n,;]+)/gi,
    /Nome:\s*([^|\n,;]+)/gi,
  ];

  for (const rx of regexes) {
    let match;
    while ((match = rx.exec(texts)) !== null) {
      const name = match[1].trim();
      const norm = normalizeText(name);
      if (norm && !seen.has(norm)) {
        seen.add(norm);
        attendees.push(name);
      }
    }
  }

  return attendees;
}

/** Agrega itens de roteiro no mesmo dia */
export function aggregateItineraryItems(items: any[], options?: { anonymize?: boolean }): any[] {
  if (!Array.isArray(items) || items.length === 0) return [];

  const groups: any[][] = [];

  for (const item of items) {
    let found = false;
    for (const g of groups) {
      if (areItineraryItemsMatching(g[0], item)) {
        g.push(item);
        found = true;
        break;
      }
    }
    if (!found) {
      groups.push([item]);
    }
  }

  return groups.map((group) => {
    if (group.length === 1) {
      const single = { ...group[0] };
      const singleAttendees = extractAttendeesFromItem(single);
      const docs = Array.isArray(single.documents) && single.documents.length > 0
        ? single.documents
        : single.document_id
        ? [{
            id: single.document_id,
            document_id: single.document_id,
            original_name: single.document_name || 'Arquivo',
            mime_type: single.document_mime_type,
            file_size: single.document_size,
          }]
        : [];

      return {
        ...single,
        documents: docs,
        attendees: singleAttendees,
        attendeesCount: singleAttendees.length || 1,
        merged_item_ids: [single.id],
      };
    }

    // Mais de 1 item agregado:
    // Escolhe o item com mais informações ou coordenadas verificadas como base
    const base = group.find((it) => it.latitude && it.longitude && it.location_confirmed_at)
      || group.find((it) => it.latitude && it.longitude)
      || group[0];

    // Documentos agregados
    const allDocs: DocumentRef[] = [];
    const seenDocIds = new Set<string>();

    for (const it of group) {
      const docList = Array.isArray(it.documents) && it.documents.length > 0
        ? it.documents
        : it.document_id
        ? [{
            id: it.document_id,
            document_id: it.document_id,
            original_name: it.document_name || 'Arquivo',
            mime_type: it.document_mime_type,
            file_size: it.document_size,
          }]
        : [];

      for (const d of docList) {
        const docId = d.document_id || d.id;
        if (docId && !seenDocIds.has(docId)) {
          seenDocIds.add(docId);
          allDocs.push({
            id: docId,
            document_id: docId,
            original_name: d.original_name || 'Arquivo',
            mime_type: d.mime_type,
            file_size: d.file_size,
          });
        }
      }
    }

    // Participantes / Titulares
    const allAttendees: string[] = [];
    const seenAtt = new Set<string>();
    for (const it of group) {
      const atts = extractAttendeesFromItem(it);
      for (const a of atts) {
        const norm = normalizeText(a);
        if (!seenAtt.has(norm)) {
          seenAtt.add(norm);
          allAttendees.push(a);
        }
      }
    }

    // Dicas agregadas
    const allTips = group
      .map((it) => it.tips)
      .filter(Boolean)
      .join(' | ');

    // Higienização / anonimização de dicas se solicitado
    let processedTips = allTips;
    if (options?.anonymize) {
      processedTips = processedTips
        .replace(/Titular:\s*[^|]+/gi, '')
        .replace(/Código:\s*[^|]+/gi, '')
        .replace(/\|\s*\|/g, '|')
        .trim();
    } else if (allAttendees.length > 1) {
      // Formata titulares consolidados
      processedTips = processedTips
        .replace(/Titular:\s*[^|]+/gi, '')
        .replace(/\|\s*\|/g, '|')
        .trim();
      const titularTag = `Titulares (${allAttendees.length}): ${allAttendees.join(', ')}`;
      processedTips = processedTips ? `${titularTag} | ${processedTips}` : titularTag;
    }

    // Notas agregadas
    const allNotes = group
      .map((it) => it.notes)
      .filter(Boolean)
      .filter((v, i, a) => a.indexOf(v) === i)
      .join('\n\n');

    return {
      ...base,
      tips: processedTips || null,
      notes: allNotes || null,
      documents: allDocs,
      document_id: allDocs[0]?.id || base.document_id || null,
      document_name: allDocs[0]?.original_name || base.document_name || null,
      attendees: allAttendees,
      attendeesCount: allAttendees.length || group.length,
      merged_item_ids: group.map((it) => it.id),
      aggregatedCount: group.length,
    };
  });
}

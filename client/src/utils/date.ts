// client/src/utils/date.ts - Utilitários para parsing e formatação segura de datas sem fuso horário indesejado

/**
 * Converte de forma segura uma data recebida do backend (DATE 'YYYY-MM-DD', ISO 'YYYY-MM-DDTHH:mm:ss.sssZ' ou timestamp)
 * em um objeto Date local sem distorção por fuso horário.
 */
export function parseSafeDate(dStr?: string | null): Date | null {
  if (!dStr) return null;
  const cleanStr = String(dStr).split('T')[0].trim();
  const parts = cleanStr.split('-');
  if (parts.length === 3) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
      return new Date(y, m, d);
    }
  }
  const parsed = new Date(dStr);
  return isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Formata uma data no formato brasileiro (DD/MM/AAAA)
 */
export function formatDateBr(
  dStr?: string | null,
  options: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric' }
): string {
  const d = parseSafeDate(dStr);
  if (!d) return '';
  return d.toLocaleDateString('pt-BR', options);
}

/**
 * Formata um intervalo de datas com elegância (ex: 15/03 — 11/04/2027)
 */
export function formatDateRange(startDate?: string | null, endDate?: string | null): string {
  if (!startDate && !endDate) return 'Datas a definir';
  const start = parseSafeDate(startDate);
  const end = parseSafeDate(endDate);

  if (start && !end) {
    return `A partir de ${start.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;
  }
  if (!start && end) {
    return `Até ${end.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;
  }
  if (start && end) {
    const sameYear = start.getFullYear() === end.getFullYear();
    const startStr = start.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      ...(sameYear ? {} : { year: 'numeric' }),
    });
    const endStr = end.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
    return `${startStr} — ${endStr}`;
  }
  return 'Datas a definir';
}

import { z } from 'zod';
import { env } from '../config/env.js';
import { query } from '../db/pool.js';
import { logger } from '../utils/logger.js';

export const AI_DOCUMENT_TYPES = [
  'flight_reservation',
  'hotel_reservation',
  'activity_ticket',
  'transport_other',
  'expense_receipt',
  'other',
] as const;

export const ITINERARY_CATEGORIES = [
  'ATTRACTION',
  'RESTAURANT',
  'TRANSPORT',
  'ACTIVITY',
  'HOTEL',
  'NOTE',
] as const;

export class AIInputValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AIInputValidationError';
  }
}

export class AIQuotaExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AIQuotaExceededError';
  }
}

const boundedString = (max: number) => z.string().trim().max(max);
const optionalBoundedString = (max: number) =>
  z.preprocess((value) => (value === null ? undefined : value), boundedString(max).optional());

const itineraryItemSchema = z
  .object({
    title: boundedString(255),
    category: z.enum(ITINERARY_CATEGORIES).default('ATTRACTION'),
    startTime: optionalBoundedString(5).refine((value) => !value || /^\d{2}:\d{2}$/.test(value), 'Horário inválido'),
    endTime: optionalBoundedString(5).refine((value) => !value || /^\d{2}:\d{2}$/.test(value), 'Horário inválido'),
    locationName: optionalBoundedString(255),
    address: optionalBoundedString(1000),
    tips: optionalBoundedString(1000),
    mapMode: z.enum(['AUTO', 'SKIP']).default('AUTO'),
  })
  .strip();

const itineraryDaySchema = z
  .object({
    dayNumber: z.number().int().min(1).max(366),
    date: optionalBoundedString(10).refine((value) => !value || /^\d{4}-\d{2}-\d{2}$/.test(value), 'Data inválida'),
    title: boundedString(255),
    subtitle: optionalBoundedString(1000),
    baseLocation: optionalBoundedString(255),
    icon: optionalBoundedString(16),
    items: z.array(itineraryItemSchema).max(20),
  })
  .strip();

const itineraryResultSchema = z.object({ days: z.array(itineraryDaySchema).max(31) }).strip();

const documentExtractionSchema = z
  .object({
    documentType: z.enum(AI_DOCUMENT_TYPES),
    confidence: z.number().finite().min(0).max(1).default(0),
    summary: boundedString(1000).default(''),
    data: z.record(z.unknown()).default({}),
  })
  .strip();

export type GuardedItineraryDay = z.infer<typeof itineraryDaySchema>;
export type GuardedDocumentExtraction = z.infer<typeof documentExtractionSchema>;

export function assertBoundedAiText(value: unknown, label = 'Texto'): string {
  if (typeof value !== 'string') {
    throw new AIInputValidationError(`${label} deve ser texto.`);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    throw new AIInputValidationError(`${label} não pode estar vazio.`);
  }
  if (trimmed.length > env.AI_MAX_INPUT_CHARS) {
    throw new AIInputValidationError(
      `${label} excede o limite de ${env.AI_MAX_INPUT_CHARS.toLocaleString('pt-BR')} caracteres.`
    );
  }
  return trimmed;
}

export function validateItineraryDays(value: unknown): GuardedItineraryDay[] {
  const parsed = itineraryResultSchema.safeParse({ days: value });
  if (!parsed.success) {
    throw new AIInputValidationError('A estrutura do roteiro excede os limites permitidos ou contém campos inválidos.');
  }
  return parsed.data.days;
}

export function validateDocumentExtraction(value: unknown): GuardedDocumentExtraction {
  const parsed = documentExtractionSchema.safeParse(value);
  if (!parsed.success) {
    throw new AIInputValidationError('A IA retornou uma estrutura de documento inválida.');
  }
  return parsed.data;
}

type AIExecutionParams = {
  userId?: string | null;
  tripId?: string | null;
  operation: string;
  reservedTokens: number;
};

let activeExecutions = 0;
const waitingExecutions: Array<() => void> = [];

async function acquireExecutionSlot(): Promise<() => void> {
  if (activeExecutions >= env.AI_MAX_CONCURRENT_REQUESTS) {
    await new Promise<void>((resolve, reject) => {
      let waiter: (() => void) | undefined;
      const timeout = setTimeout(() => {
        const index = waiter ? waitingExecutions.indexOf(waiter) : -1;
        if (index >= 0) waitingExecutions.splice(index, 1);
        reject(new AIQuotaExceededError('A fila de IA está cheia. Tente novamente em alguns segundos.'));
      }, env.AI_QUEUE_TIMEOUT_MS);

      waiter = () => {
        clearTimeout(timeout);
        resolve();
      };
      waitingExecutions.push(waiter);
    });
  }

  activeExecutions++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeExecutions = Math.max(0, activeExecutions - 1);
    waitingExecutions.shift()?.();
  };
}

async function assertDailyTokenBudget(
  column: 'user_id' | 'trip_id',
  id: string,
  limit: number,
  reservedTokens: number,
  operation: string,
  period: 'day' | 'month'
) {
  if (limit <= 0) return;

  const { rows } = await query(
    `SELECT COALESCE(SUM(total_tokens), 0) AS used_tokens
     FROM ai_audit_logs
     WHERE ${column} = $1 AND created_at >= date_trunc($2, NOW())`,
    [id, period]
  );
  const used = Number(rows[0]?.used_tokens || 0);
  const projectedUsage = used + reservedTokens;
  const ratio = projectedUsage / limit;
  if (ratio >= 0.8) {
    logger.warn('Orçamento de IA próximo do limite', {
      scope: column,
      period,
      id,
      operation,
      usedTokens: used,
      reservedTokens,
      limit,
      percent: Math.round(ratio * 100),
    });
  } else if (ratio >= 0.5) {
    logger.info('Orçamento de IA atingiu 50%', {
      scope: column,
      period,
      id,
      operation,
      usedTokens: used,
      limit,
      percent: Math.round(ratio * 100),
    });
  }
  if (projectedUsage > limit) {
    throw new AIQuotaExceededError(
      `O orçamento ${period === 'day' ? 'diário' : 'mensal'} de IA foi atingido para ${operation}. Solicite aumento da cota.`
    );
  }
}

/**
 * Applies a persistent daily token budget and a small in-process concurrency
 * gate before an outbound model request. Call the returned function in a
 * finally block as soon as the provider request completes.
 */
export async function acquireAIExecution(params: AIExecutionParams): Promise<() => void> {
  if (params.userId) {
    await assertDailyTokenBudget(
      'user_id',
      params.userId,
      env.AI_DAILY_TOKENS_PER_USER,
      params.reservedTokens,
      params.operation,
      'day'
    );
  }
  if (params.tripId) {
    await assertDailyTokenBudget(
      'trip_id',
      params.tripId,
      env.AI_DAILY_TOKENS_PER_TRIP,
      params.reservedTokens,
      params.operation,
      'day'
    );
  }
  if (params.userId) {
    await assertDailyTokenBudget(
      'user_id',
      params.userId,
      env.AI_MONTHLY_TOKENS_PER_USER,
      params.reservedTokens,
      params.operation,
      'month'
    );
  }
  if (params.tripId) {
    await assertDailyTokenBudget(
      'trip_id',
      params.tripId,
      env.AI_MONTHLY_TOKENS_PER_TRIP,
      params.reservedTokens,
      params.operation,
      'month'
    );
  }
  return acquireExecutionSlot();
}

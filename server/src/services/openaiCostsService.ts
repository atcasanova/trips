import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export interface DailyCostBucket {
  date: string;
  amountUsd: number;
}

export interface OpenAiCostResult {
  success: boolean;
  source: 'OPENAI_API' | 'LOCAL_ESTIMATE';
  totalCostUsd: number;
  keyId?: string | null;
  isKeyFiltered: boolean;
  orgTotalCostUsd?: number | null;
  dailyBreakdown?: DailyCostBucket[];
  cachedAt?: string;
  error?: string;
}

interface CacheEntry {
  data: OpenAiCostResult;
  timestamp: number;
}

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes cache
const costsCache = new Map<string, CacheEntry>();

export const openaiCostsService = {
  /**
   * Consulta os custos oficiais da organização na OpenAI filtrando pelo identificador da chave (se configurado).
   */
  async getOfficialCosts(startDate?: string, endDate?: string): Promise<OpenAiCostResult> {
    const adminKey = env.OPENAI_ADMIN_KEY;
    const targetKeyId = env.OPENAI_KEY_ID ? env.OPENAI_KEY_ID.trim() : null;

    if (!adminKey) {
      return {
        success: false,
        source: 'LOCAL_ESTIMATE',
        totalCostUsd: 0,
        isKeyFiltered: false,
        error: 'OPENAI_ADMIN_KEY não configurada no .env',
      };
    }

    const cacheKey = `${startDate || 'none'}_${endDate || 'none'}_${targetKeyId || 'all'}`;
    const cached = costsCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }

    try {
      // Limite máximo suportado pela OpenAI: últimos 364 dias
      const earliestSeconds = Math.floor(Date.now() / 1000) - 364 * 24 * 3600;

      let startSeconds: number;
      if (startDate && startDate.trim()) {
        const parsed = Date.parse(startDate);
        startSeconds = !isNaN(parsed) ? Math.floor(parsed / 1000) : Math.floor(Date.now() / 1000) - 90 * 24 * 3600;
      } else {
        // Se nenhuma data for fornecida, consulta últimos 90 dias
        startSeconds = Math.floor(Date.now() / 1000) - 90 * 24 * 3600;
      }
      if (startSeconds < earliestSeconds) {
        startSeconds = earliestSeconds;
      }

      let endSeconds: number;
      if (endDate && endDate.trim()) {
        const parsed = Date.parse(endDate);
        if (!isNaN(parsed)) {
          // Se for formato YYYY-MM-DD, estende até o final do dia
          endSeconds = /^\d{4}-\d{2}-\d{2}$/.test(endDate.trim())
            ? Math.floor((parsed + 24 * 3600 * 1000) / 1000)
            : Math.floor(parsed / 1000);
        } else {
          endSeconds = Math.floor(Date.now() / 1000);
        }
      } else {
        endSeconds = Math.floor(Date.now() / 1000);
      }

      let totalOrgCost = 0;
      let totalKeyCost = 0;
      const dailyMap = new Map<string, number>();

      let nextPage: string | null = null;
      let pageCount = 0;
      const maxPages = 10;

      do {
        pageCount++;
        const url = new URL('https://api.openai.com/v1/organization/costs');
        url.searchParams.set('start_time', String(startSeconds));
        url.searchParams.set('end_time', String(endSeconds));
        url.searchParams.set('bucket_width', '1d');
        url.searchParams.set('limit', '100');
        url.searchParams.append('group_by[]', 'api_key_id');
        if (nextPage) {
          url.searchParams.set('after', nextPage);
        }

        const response = await fetch(url.toString(), {
          headers: {
            Authorization: `Bearer ${adminKey}`,
          },
        });

        if (!response.ok) {
          const errBody = await response.text();
          logger.warn('Falha na resposta da OpenAI Costs API:', { status: response.status, body: errBody });
          return {
            success: false,
            source: 'LOCAL_ESTIMATE',
            totalCostUsd: 0,
            isKeyFiltered: Boolean(targetKeyId),
            error: `OpenAI API error (${response.status}): ${errBody}`,
          };
        }

        const data: any = await response.json();
        const buckets = Array.isArray(data.data) ? data.data : [];

        for (const bucket of buckets) {
          const bucketDate =
            bucket.start_time_iso?.slice(0, 10) ||
            new Date(bucket.start_time * 1000).toISOString().slice(0, 10);

          for (const res of bucket.results || []) {
            const amount = Number(res.amount?.value || 0);
            totalOrgCost += amount;

            const isMatchingKey = !targetKeyId || res.api_key_id === targetKeyId;
            if (isMatchingKey) {
              totalKeyCost += amount;
              dailyMap.set(bucketDate, (dailyMap.get(bucketDate) || 0) + amount);
            }
          }
        }

        if (data.has_more && data.next_page && pageCount < maxPages) {
          nextPage = data.next_page;
        } else {
          nextPage = null;
        }
      } while (nextPage);

      const dailyBreakdown: DailyCostBucket[] = Array.from(dailyMap.entries())
        .filter(([_, amt]) => amt > 0)
        .map(([date, amountUsd]) => ({
          date,
          amountUsd: Number(amountUsd.toFixed(4)),
        }))
        .sort((a, b) => b.date.localeCompare(a.date));

      const result: OpenAiCostResult = {
        success: true,
        source: 'OPENAI_API',
        totalCostUsd: Number(totalKeyCost.toFixed(4)),
        keyId: targetKeyId,
        isKeyFiltered: Boolean(targetKeyId),
        orgTotalCostUsd: Number(totalOrgCost.toFixed(4)),
        dailyBreakdown,
        cachedAt: new Date().toISOString(),
      };

      costsCache.set(cacheKey, { data: result, timestamp: Date.now() });
      return result;
    } catch (err: any) {
      logger.warn('Erro ao consultar custos oficiais da OpenAI:', { error: err.message });
      return {
        success: false,
        source: 'LOCAL_ESTIMATE',
        totalCostUsd: 0,
        isKeyFiltered: Boolean(targetKeyId),
        error: err.message,
      };
    }
  },

  /**
   * Limpa o cache de custos em memória
   */
  clearCache() {
    costsCache.clear();
  },
};

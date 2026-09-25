import pg from 'pg';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

const { Pool } = pg;

// Retorna colunas do tipo DATE (OID 1082) como strings puras 'YYYY-MM-DD', evitando conversões e fusos horários indesejados
pg.types.setTypeParser(1082, (val: string) => val);

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  logger.error('Unexpected error on idle PostgreSQL client', { error: err.message });
});

export async function query<T extends pg.QueryResultRow = any>(text: string, params?: any[]): Promise<pg.QueryResult<T>> {
  const start = Date.now();
  try {
    const res = await pool.query<T>(text, params);
    const duration = Date.now() - start;
    if (duration > 1000) {
      logger.warn('Slow query detected', { duration, text: text.slice(0, 100) });
    }
    return res;
  } catch (err: any) {
    logger.error('Database query error', { error: err.message, text: text.slice(0, 150) });
    throw err;
  }
}

export async function checkDbHealth(): Promise<{ status: 'healthy' | 'unhealthy'; latencyMs: number; error?: string }> {
  const start = Date.now();
  try {
    await pool.query('SELECT 1');
    return { status: 'healthy', latencyMs: Date.now() - start };
  } catch (err: any) {
    return { status: 'unhealthy', latencyMs: Date.now() - start, error: err.message };
  }
}

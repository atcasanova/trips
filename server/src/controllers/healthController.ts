import { Request, Response } from 'express';
import { checkDbHealth } from '../db/pool.js';
import { env } from '../config/env.js';

export const healthController = {
  async check(_req: Request, res: Response) {
    const dbHealth = await checkDbHealth();

    const isHealthy = dbHealth.status === 'healthy';
    const statusCode = isHealthy ? 200 : 503;

    return res.status(statusCode).json({
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      components: {
        application: {
          status: 'healthy',
          nodeVersion: process.version,
          environment: env.NODE_ENV,
        },
        database: {
          status: dbHealth.status,
          latencyMs: dbHealth.latencyMs,
        },
        integrations: {
          openaiConfigured: Boolean(env.OPENAI_API_KEY),
          pexelsConfigured: Boolean(env.PEXELS_API_KEY),
          turnstileEnabled: env.TURNSTILE_ENABLED,
          turnstileSiteKey: env.TURNSTILE_ENABLED ? env.TURNSTILE_SITE_KEY : undefined,
        },
      },
    });
  },
};

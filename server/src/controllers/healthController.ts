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
      components: {
        integrations: {
          turnstileEnabled: env.TURNSTILE_ENABLED,
          turnstileSiteKey: env.TURNSTILE_ENABLED ? env.TURNSTILE_SITE_KEY : undefined,
        },
      },
    });
  },
};

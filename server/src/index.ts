import { app } from './app.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { runMigrations } from './db/migrate.js';
import { seedDemoData } from './db/seed.js';
import { pool } from './db/pool.js';

async function startServer() {
  try {
    logger.info('Iniciando Trips Server...', { env: env.NODE_ENV, port: env.PORT, appUrl: env.APP_URL });

    // 1. Run migrations and admin bootstrap
    try {
      await runMigrations();
      if (env.SEED_DEMO) {
        await seedDemoData();
      }
    } catch (migErr: any) {
      logger.error('Falha ao executar migrations no banco de dados:', { error: migErr.message });
      // In containerized environment, retry connection or allow startup
    }

    // 2. Start HTTP Server
    const server = app.listen(env.PORT, '0.0.0.0', () => {
      logger.info(`Trips Server rodando com sucesso em http://0.0.0.0:${env.PORT}`);
      logger.info(`Healthcheck disponível em http://0.0.0.0:${env.PORT}/api/health`);
    });

    // Graceful Shutdown
    const shutdown = async (signal: string) => {
      logger.info(`Recebido ${signal}. Encerrando servidor de forma graciosa...`);
      server.close(async () => {
        logger.info('Servidor HTTP encerrado.');
        try {
          await pool.end();
          logger.info('Pool do PostgreSQL desconectado.');
        } catch (e) {}
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err: any) {
    logger.error('Erro fatal ao iniciar servidor:', { error: err.message, stack: err.stack });
    process.exit(1);
  }
}

startServer();

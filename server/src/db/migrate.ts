import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import argon2 from 'argon2';
import { pool, query } from './pool.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations() {
  logger.info('Iniciando verificação de migrations...');
  
  // 1. Ensure migrations table exists
  await query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // 2. Read migration files
  const candidateDirs = [
    path.join(__dirname, 'migrations'),
    path.join(__dirname, '../../src/db/migrations'),
    path.join(process.cwd(), 'src/db/migrations'),
    path.join(process.cwd(), 'dist/db/migrations'),
  ];
  const migrationsDir = candidateDirs.find(d => fs.existsSync(d));

  if (!migrationsDir) {
    logger.warn('Diretório de migrations não encontrado em nenhum dos caminhos:', candidateDirs);
    return;
  }

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  const { rows: appliedRows } = await query('SELECT name FROM migrations');
  const appliedSet = new Set(appliedRows.map((r: any) => r.name));

  for (const file of files) {
    if (!appliedSet.has(file)) {
      logger.info(`Aplicando migration: ${file}...`);
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf-8');

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        logger.info(`Migration ${file} aplicada com sucesso!`);
      } catch (err: any) {
        await client.query('ROLLBACK');
        logger.error(`Falha ao aplicar migration ${file}:`, { error: err.message });
        throw err;
      } finally {
        client.release();
      }
    } else {
      logger.debug(`Migration já aplicada: ${file}`);
    }
  }

  // 3. Bootstrap Admin User Idempotently
  await bootstrapAdmin();
}

export async function bootstrapAdmin() {
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) {
    logger.warn('ADMIN_EMAIL ou ADMIN_PASSWORD não configurados. Pulando bootstrap de admin.');
    return;
  }

  const email = env.ADMIN_EMAIL.toLowerCase().trim();
  const { rows } = await query('SELECT id, email, role FROM users WHERE email = $1', [email]);
  
  const passwordHash = await argon2.hash(env.ADMIN_PASSWORD, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  if (rows.length === 0) {
    logger.info(`Criando usuário administrador inicial (${email})...`);
    await query(
      `INSERT INTO users (email, password_hash, name, role, status)
       VALUES ($1, $2, $3, 'ADMIN', 'ACTIVE')`,
      [email, passwordHash, env.ADMIN_NAME]
    );
    logger.info('Usuário administrador inicial criado com sucesso!');
  } else {
    // O usuário já existe no banco de dados. A senha do banco tem precedência absoluta sobre o .env.
    // Ignora permanentemente o ADMIN_PASSWORD do .env para respeitar alterações manuais.
    logger.info(`Usuário administrador (${email}) já existe. Senha do banco preservada (ADMIN_PASSWORD do .env ignorado).`);
  }
}

// Allow executing directly via `tsx src/db/migrate.ts`
if (process.argv[1] === __filename) {
  runMigrations()
    .then(() => {
      logger.info('Processo de migrations finalizado.');
      process.exit(0);
    })
    .catch((err) => {
      logger.error('Erro crítico nas migrations:', err);
      process.exit(1);
    });
}

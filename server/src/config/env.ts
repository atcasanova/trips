import path from 'path';
import dotenv from 'dotenv';

// Load .env
dotenv.config();

export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  PORT: parseInt(process.env.APP_PORT || process.env.PORT || '3000', 10),
  APP_URL: process.env.APP_URL || 'https://trips.bru.to',
  
  DATABASE_URL: process.env.DATABASE_URL || 'postgresql://trips:trips_password@localhost:5432/trips',
  
  ADMIN_EMAIL: process.env.ADMIN_EMAIL || 'admin@bru.to',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'admin_secret_2026',
  ADMIN_NAME: process.env.ADMIN_NAME || 'Administrador',
  
  SESSION_SECRET: process.env.SESSION_SECRET || 'trips-super-secret-session-key-change-me',
  COOKIE_NAME: 'trips_session',
  
  SMTP_HOST: process.env.SMTP_HOST || '172.25.0.1',
  SMTP_PORT: parseInt(process.env.SMTP_PORT || '25', 10),
  SMTP_SECURE: process.env.SMTP_SECURE === 'true',
  MAIL_FROM: process.env.MAIL_FROM || 'Trips <trips@bru.to>',
  
  TURNSTILE_ENABLED: process.env.TURNSTILE_ENABLED === 'true',
  TURNSTILE_SITE_KEY: process.env.TURNSTILE_SITE_KEY || '',
  TURNSTILE_SECRET: process.env.TURNSTILE_SECRET || '',
  
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  OPENAI_MODEL: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  // Pode ser definido separadamente porque a localização usa Responses + web_search.
  OPENAI_MAP_MODEL: process.env.OPENAI_MAP_MODEL || process.env.OPENAI_MODEL || 'gpt-5.6-luna',
  
  PEXELS_API_KEY: process.env.PEXELS_API_KEY || '',
  
  UPLOAD_PATH: process.env.UPLOAD_PATH || path.resolve(process.cwd(), 'uploads'),
  MAX_UPLOAD_SIZE_MB: parseInt(process.env.MAX_UPLOAD_SIZE_MB || '25', 10),
  
  SEED_DEMO: process.env.SEED_DEMO === 'true',
  INBOUND_EMAIL_SECRET: process.env.INBOUND_EMAIL_SECRET || 'trips_inbound_secure_email_token_2026',
};

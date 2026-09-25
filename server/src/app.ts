import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { fileURLToPath } from 'url';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import routes from './routes/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const app = express();

// Trust reverse proxy (Nginx Proxy Manager: 1 hop)
app.set('trust proxy', 1);

// CORS configuration
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, server-to-server) or matching APP_URL
      if (!origin || origin === env.APP_URL || origin.includes('localhost') || origin.includes('127.0.0.1')) {
        callback(null, true);
      } else {
        callback(null, true); // Permissive in internal Docker network
      }
    },
    credentials: true,
  })
);

// Parsers
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
app.use(cookieParser());

// Request logger
app.use((req: Request, _res: Response, next: NextFunction) => {
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() || req.ip;
  if (!req.path.startsWith('/public') && !req.path.includes('.')) {
    logger.debug(`${req.method} ${req.path}`, { ip });
  }
  next();
});

// REST API routes
app.use('/api', routes);

// Static uploads directory
if (fs.existsSync(env.UPLOAD_PATH)) {
  app.use('/uploads', express.static(env.UPLOAD_PATH));
}

// Serve Frontend (React Vite build)
const publicDir = path.resolve(__dirname, '../public');
if (fs.existsSync(publicDir)) {
  // Service Worker route with specific PWA headers
  app.get('/sw.js', (_req: Request, res: Response) => {
    const swPath = path.join(publicDir, 'sw.js');
    if (fs.existsSync(swPath)) {
      res.setHeader('Content-Type', 'application/javascript');
      res.setHeader('Service-Worker-Allowed', '/');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      return res.sendFile(swPath);
    }
    return res.status(404).send('Service worker not found');
  });

  // Web App Manifest route
  app.get(['/manifest.json', '/manifest.webmanifest'], (_req: Request, res: Response) => {
    const manifestPath = path.join(publicDir, 'manifest.json');
    if (fs.existsSync(manifestPath)) {
      res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.sendFile(manifestPath);
    }
    return res.status(404).send('Manifest not found');
  });

  app.use(express.static(publicDir));

  // SPA fallback: return index.html for unknown routes
  app.get('*', (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
      return next();
    }
    const indexPath = path.join(publicDir, 'index.html');
    if (fs.existsSync(indexPath)) {
      return res.sendFile(indexPath);
    }
    next();
  });
}

// 404 handler for API
app.use('/api/*', (_req: Request, res: Response) => {
  res.status(404).json({ error: 'Endpoint da API não encontrado' });
});

// Global Error Handler
app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
  logger.error('Erro não tratado na aplicação:', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  const statusCode = err.status || 500;
  return res.status(statusCode).json({
    error: err.message || 'Erro interno do servidor',
  });
});

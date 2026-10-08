import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { env } from '../config/env.js';
import { query } from '../db/pool.js';
import { User, TripRole } from '../types/index.js';
import { logger } from '../utils/logger.js';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: User;
      tripRole?: TripRole;
    }
  }
}

interface TokenPayload {
  userId: string;
  role: string;
  exp: number;
}

export function createSessionToken(userId: string, role: string): string {
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7; // 7 days
  const payload: TokenPayload = { userId, role, exp };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  
  const signature = crypto
    .createHmac('sha256', env.SESSION_SECRET)
    .update(payloadB64)
    .digest('base64url');

  return `${payloadB64}.${signature}`;
}

export function verifySessionToken(token: string): TokenPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [payloadB64, signature] = parts;

    const expectedSig = crypto
      .createHmac('sha256', env.SESSION_SECRET)
      .update(payloadB64)
      .digest('base64url');

    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
      return null;
    }

    const payload: TokenPayload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'));
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      return null; // Expired
    }

    return payload;
  } catch (err) {
    return null;
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[env.COOKIE_NAME] || req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'Não autenticado' });
  }

  const payload = verifySessionToken(token);
  if (!payload) {
    res.clearCookie(env.COOKIE_NAME, {
      httpOnly: true,
      secure: env.isProduction || env.APP_URL.startsWith('https'),
      sameSite: 'lax',
      path: '/',
    });
    return res.status(401).json({ error: 'Não autenticado' });
  }

  try {
    const { rows } = await query(
      `SELECT id, email, name, role, status, avatar_url, last_login_at, created_at, updated_at
       FROM users WHERE id = $1`,
      [payload.userId]
    );

    if (rows.length === 0 || rows[0].status !== 'ACTIVE') {
      res.clearCookie(env.COOKIE_NAME, {
        httpOnly: true,
        secure: env.isProduction || env.APP_URL.startsWith('https'),
        sameSite: 'lax',
        path: '/',
      });
      return res.status(401).json({ error: 'Não autenticado' });
    }

    req.user = rows[0] as User;
    next();
  } catch (err: any) {
    logger.error('Erro na autenticação:', { error: err.message });
    return res.status(500).json({ error: 'Erro interno ao validar sessão' });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Acesso restrito a administradores' });
  }
  next();
}

const roleHierarchy: Record<TripRole, number> = {
  OWNER: 3,
  EDITOR: 2,
  VIEWER: 1,
};

export function requireTripRole(minRole: TripRole) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    const tripId = req.params.tripId || req.params.id;
    if (!tripId) {
      return res.status(400).json({ error: 'ID da viagem não informado' });
    }

    // Admins have universal master access
    if (req.user.role === 'ADMIN') {
      req.tripRole = 'OWNER';
      return next();
    }

    try {
      const { rows } = await query(
        `SELECT role FROM trip_members WHERE trip_id = $1 AND user_id = $2`,
        [tripId, req.user.id]
      );

      if (rows.length === 0) {
        return res.status(403).json({ error: 'Você não tem permissão para acessar esta viagem' });
      }

      const userRole = rows[0].role as TripRole;
      if (roleHierarchy[userRole] < roleHierarchy[minRole]) {
        return res.status(403).json({ error: `Permissão insuficiente. Nível requerido: ${minRole}` });
      }

      req.tripRole = userRole;
      next();
    } catch (err: any) {
      logger.error('Erro ao verificar permissão da viagem:', { error: err.message });
      return res.status(500).json({ error: 'Erro ao verificar permissões' });
    }
  };
}

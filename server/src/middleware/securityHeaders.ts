import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';

export const CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://static.cloudflareinsights.com https://unpkg.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https://challenges.cloudflare.com https://cloudflareinsights.com https://*.tile.openstreetmap.de https://*.tile.openstreetmap.org https://tile.openstreetmap.org",
  "frame-src 'self' https://challenges.cloudflare.com",
  "frame-ancestors 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
].join('; ');

export const normalizeOrigin = (urlStr: string): string => {
  try {
    return new URL(urlStr).origin.toLowerCase();
  } catch {
    return urlStr.replace(/\/$/, '').toLowerCase();
  }
};

export const isAllowedOrigin = (origin?: string, appUrl: string = env.APP_URL): boolean => {
  if (!origin) return true; // Allow non-browser requests (cURL, mobile apps, server webhooks)

  try {
    const parsed = new URL(origin);
    const parsedOrigin = parsed.origin.toLowerCase();
    const appOrigin = normalizeOrigin(appUrl);

    // 1. Exact match with configured APP_URL
    if (parsedOrigin === appOrigin) {
      return true;
    }

    // 2. Allow local development (localhost / 127.0.0.1 on any port)
    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
      return true;
    }

    return false;
  } catch {
    return false;
  }
};

export function securityHeaders(req: Request, res: Response, next: NextFunction) {
  // 1. Prevent MIME-sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // 2. Prevent clickjacking (allow same-origin framing for document previews)
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');

  // 3. Referrer Policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // 4. Disable legacy buggy browser XSS auditor
  res.setHeader('X-XSS-Protection', '0');

  // 5. Strict-Transport-Security (HSTS) - enforce HTTPS in production
  const isHttps =
    req.secure ||
    req.headers['x-forwarded-proto'] === 'https' ||
    env.isProduction ||
    env.APP_URL.startsWith('https://');

  if (isHttps) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  // 6. Content-Security-Policy tailored for Trips (Turnstile, Leaflet/OSM, Pexels, Fonts)
  res.setHeader('Content-Security-Policy', CSP_DIRECTIVES);

  next();
}

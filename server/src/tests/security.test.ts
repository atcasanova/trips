import { test, describe } from 'node:test';
import assert from 'node:assert';
import { isAllowedOrigin, securityHeaders, CSP_DIRECTIVES } from '../middleware/securityHeaders.js';
import { healthController } from '../controllers/healthController.js';
import { requireAuth } from '../middleware/auth.js';
import { authController } from '../controllers/authController.js';
import { env } from '../config/env.js';

describe('4. Hardening de Infraestrutura & Segurança HTTP (Etapa 1)', () => {
  describe('CORS Allowlist Validation', () => {
    const APP_URL = 'https://trips.bru.to';

    test('Deve permitir requisições sem Origin (cURL, mobile apps, webhooks de email)', () => {
      assert.strictEqual(isAllowedOrigin(undefined, APP_URL), true);
      assert.strictEqual(isAllowedOrigin('', APP_URL), true);
    });

    test('Deve permitir exatamente a URL configurada da aplicação (APP_URL)', () => {
      assert.strictEqual(isAllowedOrigin('https://trips.bru.to', APP_URL), true);
      assert.strictEqual(isAllowedOrigin('https://trips.bru.to/', APP_URL), true);
    });

    test('Deve permitir origens locais de desenvolvimento (localhost e 127.0.0.1 em qualquer porta)', () => {
      assert.strictEqual(isAllowedOrigin('http://localhost:3000', APP_URL), true);
      assert.strictEqual(isAllowedOrigin('http://localhost:5173', APP_URL), true);
      assert.strictEqual(isAllowedOrigin('http://127.0.0.1:3000', APP_URL), true);
      assert.strictEqual(isAllowedOrigin('http://127.0.0.1:5173', APP_URL), true);
    });

    test('Deve rejeitar origens arbitrárias de atacantes', () => {
      assert.strictEqual(isAllowedOrigin('https://attacker.com', APP_URL), false);
      assert.strictEqual(isAllowedOrigin('https://evil.org', APP_URL), false);
      assert.strictEqual(isAllowedOrigin('http://hacker.site', APP_URL), false);
    });

    test('Deve rejeitar subdomínios maliciosos ou spoofing de sufixo (ex: trips.bru.to.evil.com)', () => {
      assert.strictEqual(isAllowedOrigin('https://trips.bru.to.evil.com', APP_URL), false);
      assert.strictEqual(isAllowedOrigin('https://evil-trips.bru.to', APP_URL), false);
      assert.strictEqual(isAllowedOrigin('https://fake-trips.bru.to.com', APP_URL), false);
    });

    test('Deve rejeitar valores anômalos (null, URLs malformadas)', () => {
      assert.strictEqual(isAllowedOrigin('null', APP_URL), false);
      assert.strictEqual(isAllowedOrigin('javascript:alert(1)', APP_URL), false);
      assert.strictEqual(isAllowedOrigin('https://evil.com?q=1', APP_URL), false);
    });
  });

  describe('Security Headers Middleware', () => {
    test('Deve emitir todos os cabeçalhos de proteção (nosniff, SAMEORIGIN, CSP, HSTS)', () => {
      const headers: Record<string, string> = {};
      const mockReq: any = {
        secure: true,
        headers: { 'x-forwarded-proto': 'https' },
      };
      const mockRes: any = {
        setHeader: (name: string, value: string) => {
          headers[name.toLowerCase()] = value;
        },
      };

      let nextCalled = false;
      securityHeaders(mockReq, mockRes, () => {
        nextCalled = true;
      });

      assert.strictEqual(nextCalled, true, 'Next function deve ser chamada');
      assert.strictEqual(headers['x-content-type-options'], 'nosniff');
      assert.strictEqual(headers['x-frame-options'], 'SAMEORIGIN');
      assert.strictEqual(headers['referrer-policy'], 'strict-origin-when-cross-origin');
      assert.strictEqual(headers['x-xss-protection'], '0');
      assert.strictEqual(headers['strict-transport-security'], 'max-age=31536000; includeSubDomains');

      // Validar CSP
      const csp = headers['content-security-policy'];
      assert.ok(csp, 'CSP deve ser emitida');
      assert.ok(csp.includes("default-src 'self'"), 'CSP deve ter default-src self');
      assert.ok(csp.includes('https://challenges.cloudflare.com'), 'CSP deve permitir Turnstile');
      assert.ok(csp.includes('https://*.tile.openstreetmap.de'), 'CSP deve permitir mapas OpenStreetMap');
      assert.ok(csp.includes('https://unpkg.com'), 'CSP deve permitir unpkg Leaflet para TripBook público');
      assert.ok(csp.includes('https://images.pexels.com') || csp.includes('https:'), 'CSP deve permitir imagens');
      assert.ok(csp.includes("frame-ancestors 'self'"), 'CSP deve conter frame-ancestors self para prevenir clickjacking');
    });
  });
});

describe('5. Higienização de Sessão, Healthcheck e Oráculo de 401 (Etapa 2)', () => {
  test('Healthcheck não deve vazar métricas internas (Node version, uptime, latency, DB status)', async () => {
    let capturedStatus = 0;
    let capturedJson: any = null;

    const mockReq: any = {};
    const mockRes: any = {
      status: (code: number) => {
        capturedStatus = code;
        return {
          json: (data: any) => {
            capturedJson = data;
            return data;
          },
        };
      },
    };

    await healthController.check(mockReq, mockRes);

    assert.ok([200, 503].includes(capturedStatus));
    assert.ok(['healthy', 'unhealthy'].includes(capturedJson.status));
    assert.ok(capturedJson.timestamp);

    // Não deve vazar dados de fingerprinting ou ambiente interno
    assert.strictEqual(capturedJson.uptimeSeconds, undefined);
    assert.strictEqual(capturedJson.components.application, undefined);
    assert.strictEqual(capturedJson.components.database, undefined);
    assert.strictEqual(capturedJson.components.integrations.openaiConfigured, undefined);
    assert.strictEqual(capturedJson.components.integrations.pexelsConfigured, undefined);

    // Deve preservar o que o frontend necessita para o login Turnstile
    assert.ok('turnstileEnabled' in capturedJson.components.integrations);
  });

  test('requireAuth deve normalizar erro 401 para "Não autenticado" sem vazar oráculo de sessão', async () => {
    let resCodeNoToken = 0;
    let resJsonNoToken: any = null;
    const reqNoToken: any = { cookies: {}, headers: {} };
    const resNoToken: any = {
      status: (c: number) => {
        resCodeNoToken = c;
        return { json: (d: any) => { resJsonNoToken = d; } };
      },
      clearCookie: () => {},
    };

    await requireAuth(reqNoToken, resNoToken, () => {});
    assert.strictEqual(resCodeNoToken, 401);
    assert.strictEqual(resJsonNoToken.error, 'Não autenticado');

    // Com token inválido/garbage
    let resCodeInvalid = 0;
    let resJsonInvalid: any = null;
    let clearedCookieName = '';
    let clearedCookieOptions: any = null;

    const reqInvalid: any = { cookies: { [env.COOKIE_NAME]: 'garbage.invalid.token' }, headers: {} };
    const resInvalid: any = {
      status: (c: number) => {
        resCodeInvalid = c;
        return { json: (d: any) => { resJsonInvalid = d; } };
      },
      clearCookie: (name: string, opts: any) => {
        clearedCookieName = name;
        clearedCookieOptions = opts;
      },
    };

    await requireAuth(reqInvalid, resInvalid, () => {});
    assert.strictEqual(resCodeInvalid, 401);
    assert.strictEqual(resJsonInvalid.error, 'Não autenticado', 'Mensagem de 401 deve ser idêntica');
    assert.strictEqual(clearedCookieName, env.COOKIE_NAME);
    assert.strictEqual(clearedCookieOptions?.httpOnly, true);
    assert.strictEqual(clearedCookieOptions?.sameSite, 'lax');
    assert.strictEqual(clearedCookieOptions?.path, '/');
  });

  test('Logout deve limpar cookie com opções explícitas (HttpOnly, SameSite, Path)', async () => {
    let clearedCookieName = '';
    let clearedCookieOptions: any = null;
    let resJson: any = null;

    const mockReq: any = {};
    const mockRes: any = {
      clearCookie: (name: string, opts: any) => {
        clearedCookieName = name;
        clearedCookieOptions = opts;
      },
      json: (d: any) => { resJson = d; },
    };

    await authController.logout(mockReq, mockRes);

    assert.strictEqual(clearedCookieName, env.COOKIE_NAME);
    assert.strictEqual(clearedCookieOptions?.httpOnly, true);
    assert.strictEqual(clearedCookieOptions?.sameSite, 'lax');
    assert.strictEqual(clearedCookieOptions?.path, '/');
    assert.strictEqual(resJson?.message, 'Logout realizado com sucesso');
  });
});

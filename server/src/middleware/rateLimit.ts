import rateLimit from 'express-rate-limit';

// Strict limiter for authentication attempts (brute force protection)
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 requests per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
  message: { error: 'Muitas tentativas de login. Aguarde alguns minutos antes de tentar novamente.' },
});

// General API rate limiter
export const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 300, // 300 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
  message: { error: 'Limite de requisições excedido. Reduza a frequência de chamadas.' },
});

function aiUserLimiter(max: number, message: string) {
  return rateLimit({
    windowMs: 60 * 60 * 1000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    // These limiters are mounted after requireAuth, so the quota follows the
    // account rather than a shared NAT/proxy IP address.
    keyGenerator: (req) => `user:${(req as any).user?.id || 'unauthenticated'}`,
    message: { error: message },
  });
}

// Cost-bearing AI routes. Daily token budgets and provider concurrency are
// enforced in aiGuardrails; these limits reject bursts before files or prompts
// can consume CPU, storage, or paid model capacity.
export const aiDocumentUploadLimiter = aiUserLimiter(5, 'Limite de 5 uploads com IA por hora atingido.');
export const aiDocumentReprocessLimiter = aiUserLimiter(3, 'Limite de 3 reprocessamentos por hora atingido.');
export const aiItineraryParseLimiter = aiUserLimiter(5, 'Limite de 5 análises de roteiro por hora atingido.');
export const aiNarrativeLimiter = aiUserLimiter(20, 'Limite de 20 narrativas por hora atingido.');
export const aiPexelsSuggestionLimiter = aiUserLimiter(20, 'Limite de 20 sugestões por hora atingido.');

export const inboundEmailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Limite de 10 e-mails inbound por hora atingido.' },
});


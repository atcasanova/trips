type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

const sanitize = (data: any): any => {
  if (!data || typeof data !== 'object') return data;
  if (Array.isArray(data)) return data.map(sanitize);

  const clean: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    const lower = key.toLowerCase();
    if (
      lower.includes('password') ||
      lower.includes('secret') ||
      lower.includes('token') ||
      lower.includes('api_key') ||
      lower.includes('apikey') ||
      lower.includes('cookie') ||
      lower.includes('authorization')
    ) {
      clean[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      clean[key] = sanitize(value);
    } else {
      clean[key] = value;
    }
  }
  return clean;
};

const formatMessage = (level: LogLevel, message: string, meta?: any) => {
  const timestamp = new Date().toISOString();
  const safeMeta = meta ? sanitize(meta) : undefined;
  const metaStr = safeMeta ? ` ${JSON.stringify(safeMeta)}` : '';
  return `[${timestamp}] [${level}] ${message}${metaStr}`;
};

export const logger = {
  debug: (msg: string, meta?: any) => {
    if (process.env.NODE_ENV !== 'production') {
      console.debug(formatMessage('DEBUG', msg, meta));
    }
  },
  info: (msg: string, meta?: any) => console.log(formatMessage('INFO', msg, meta)),
  warn: (msg: string, meta?: any) => console.warn(formatMessage('WARN', msg, meta)),
  error: (msg: string, meta?: any) => console.error(formatMessage('ERROR', msg, meta)),
};

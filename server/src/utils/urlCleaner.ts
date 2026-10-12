/**
 * URL Sanitizer & Tracking Remover
 * Removes common tracking query parameters and applies automatic heuristic
 * for opaque Instagram sharing tokens.
 */

// Tracking parameters removed across all sites
const KNOWN_TRACKING_PREFIXES = ['utm_'];
const KNOWN_TRACKING_KEYS = new Set([
  'fbclid',
  'gclid',
  'dclid',
  'msclkid',
  'mc_eid',
  '_ga',
  '_gl',
  'igsh',
  'igshid',
  'si', // Spotify / YouTube share
  'feature', // e.g. feature=share on YouTube
]);

/**
 * Checks if a string is a valid Base64 string that decodes to exactly
 * 10 lowercase hexadecimal characters (0-9a-f).
 */
export function isValidInstagramOpaqueToken(val: string): boolean {
  if (!val || typeof val !== 'string') return false;

  // Support standard Base64 and Base64URL
  const normalized = val.replace(/-/g, '+').replace(/_/g, '/');
  // Check valid base64 chars pattern
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) {
    return false;
  }

  try {
    const buf = Buffer.from(normalized, 'base64');
    // 10 hex characters in UTF-8 / ASCII = exactly 10 bytes
    if (buf.length !== 10) {
      return false;
    }
    const decodedStr = buf.toString('utf-8');
    // Must be exactly 10 lowercase hex characters (0-9a-f)
    if (!/^[0-9a-f]{10}$/.test(decodedStr)) {
      return false;
    }

    // Verify round-trip to guarantee the input was valid Base64 for this exact decoded string
    const pad = (s: string) => s + '='.repeat((4 - (s.length % 4)) % 4);
    const expectedBase64 = buf.toString('base64');
    return pad(normalized) === pad(expectedBase64);
  } catch {
    return false;
  }
}

/**
 * Checks if the hostname is instagram.com or any subdomain (e.g. www.instagram.com, m.instagram.com).
 */
export function isInstagramHost(hostname: string): boolean {
  const normHost = hostname.toLowerCase();
  return normHost === 'instagram.com' || normHost.endsWith('.instagram.com');
}

/**
 * Checks if the route is an Instagram media route: /p/<id> or /reel/<id> (or /reels/<id>).
 */
export function isInstagramMediaRoute(pathname: string): boolean {
  return /^\/(?:p|reel|reels)\/[a-zA-Z0-9_-]+\/?$/i.test(pathname);
}

/**
 * Cleans a URL by removing marketing tracking parameters and Instagram opaque share tokens.
 */
export function cleanUrl(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    try {
      parsed = new URL(`https://${trimmed}`);
    } catch {
      return trimmed;
    }
  }

  const isInsta = isInstagramHost(parsed.hostname);
  const isMedia = isInstagramMediaRoute(parsed.pathname);

  // Group parameters by key
  const keysToDelete = new Set<string>();
  const searchParams = parsed.searchParams;

  // Collect distinct keys
  const allKeys = Array.from(new Set(searchParams.keys()));

  for (const key of allKeys) {
    const lowerKey = key.toLowerCase();

    // 1. Remove standard tracking by prefix (utm_*)
    if (KNOWN_TRACKING_PREFIXES.some((prefix) => lowerKey.startsWith(prefix))) {
      keysToDelete.add(key);
      continue;
    }

    // 2. Remove standard tracking by known key name
    if (KNOWN_TRACKING_KEYS.has(lowerKey)) {
      keysToDelete.add(key);
      continue;
    }

    // 3. Instagram heuristic for opaque share tokens:
    // host is instagram.com (or subdomain)
    // route is media route (/p/<id> or /reel/<id>)
    // key has exactly 4 lowercase letters (/^[a-z]{4}$/)
    // all values are valid Base64 that decode to exactly 10 lowercase hex characters (0-9a-f)
    if (isInsta && isMedia && /^[a-z]{4}$/.test(key)) {
      const values = searchParams.getAll(key);
      if (values.length > 0 && values.every((v) => isValidInstagramOpaqueToken(v))) {
        keysToDelete.add(key);
      }
    }
  }

  for (const key of keysToDelete) {
    searchParams.delete(key);
  }

  // Return clean URL string (avoiding trailing question mark if search is empty)
  let result = parsed.toString();
  if (result.endsWith('?')) {
    result = result.slice(0, -1);
  }
  return result;
}

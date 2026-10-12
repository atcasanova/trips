import { logger } from '../utils/logger.js';

export interface OpenGraphData {
  title: string | null;
  description: string | null;
  site_name: string | null;
  image_url: string | null;
  video_url: string | null;
  hashtags: string[];
  metadata: Record<string, string>;
}

// Helper to decode basic HTML entities
function decodeHtmlEntities(str: string): string {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&nbsp;/g, ' ');
}

// Extract hashtags from text (supports unicode accents)
export function extractHashtags(text: string): string[] {
  if (!text) return [];
  const regex = /#([a-zA-Z0-9_\u00C0-\u017F]+)/g;
  const matches = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match[1]) {
      matches.add(match[1].toLowerCase());
    }
  }
  return Array.from(matches);
}

// Derive a human-friendly site name from hostname if og:site_name is missing
export function deriveSiteName(hostname: string): string {
  const norm = hostname.toLowerCase();
  if (norm.includes('instagram.com')) return 'Instagram';
  if (norm.includes('tiktok.com')) return 'TikTok';
  if (norm.includes('youtube.com') || norm.includes('youtu.be')) return 'YouTube';
  if (norm.includes('pinterest.com')) return 'Pinterest';
  if (norm.includes('tripadvisor.com')) return 'Tripadvisor';
  if (norm.includes('google.com/maps') || norm.includes('maps.app.goo.gl')) return 'Google Maps';
  if (norm.includes('twitter.com') || norm.includes('x.com')) return 'X / Twitter';
  if (norm.includes('facebook.com')) return 'Facebook';
  if (norm.includes('reddit.com')) return 'Reddit';

  // Capitalize main domain name (e.g. "lonelyplanet.com" -> "Lonely Planet" or "Lonelyplanet")
  const parts = norm.replace(/^www\./, '').split('.');
  if (parts.length > 0 && parts[0]) {
    return parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  }
  return hostname;
}

/**
 * Fetches and parses OpenGraph metadata from a given target URL.
 */
export async function scrapeOpenGraph(targetUrl: string): Promise<OpenGraphData> {
  const fallbackSiteName = (() => {
    try {
      return deriveSiteName(new URL(targetUrl).hostname);
    } catch {
      return 'Web';
    }
  })();

  const result: OpenGraphData = {
    title: null,
    description: null,
    site_name: fallbackSiteName,
    image_url: null,
    video_url: null,
    hashtags: [],
    metadata: {},
  };

  try {
    const parsed = new URL(targetUrl);

    // 1. YouTube oEmbed shortcut (fast, reliable, official)
    if (parsed.hostname.includes('youtube.com') || parsed.hostname.includes('youtu.be')) {
      try {
        const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(targetUrl)}&format=json`;
        const resp = await fetch(oembedUrl, { signal: AbortSignal.timeout(4000) });
        if (resp.ok) {
          const data = (await resp.json()) as any;
          result.title = data.title || null;
          result.site_name = 'YouTube';
          result.image_url = data.thumbnail_url || null;
          if (data.author_name) {
            result.description = `Canal: ${data.author_name}`;
          }
        }
      } catch {
        // Fallback to regular scraper below
      }
    }

    // 2. Fetch HTML using a Facebook / Twitter social bot User-Agent
    // Social platforms (Instagram, TikTok, LinkedIn) render complete OpenGraph tags for bot crawlers
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const userAgents = [
      'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.html)',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    ];

    let html = '';
    for (const ua of userAgents) {
      try {
        const response = await fetch(targetUrl, {
          signal: controller.signal,
          headers: {
            'User-Agent': ua,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
          },
          redirect: 'follow',
        });

        if (response.ok) {
          html = await response.text();
          if (html.length > 500) {
            break;
          }
        }
      } catch {
        // Try next UA or fallback
      }
    }

    clearTimeout(timeout);

    if (html) {
      // Regex meta tag parser
      const metaTagRegex = /<meta\s+[^>]*?(?:name|property)=["']([^"']+)["'][^>]*?content=["']([^"']*)["'][^>]*?>|<meta\s+[^>]*?content=["']([^"']*)["'][^>]*?(?:name|property)=["']([^"']+)["'][^>]*?>/gi;

      let match: RegExpExecArray | null;
      while ((match = metaTagRegex.exec(html)) !== null) {
        const key = (match[1] || match[4] || '').toLowerCase().trim();
        const content = decodeHtmlEntities(match[2] || match[3] || '').trim();

        if (key && content) {
          result.metadata[key] = content;

          if (key === 'og:title' || (!result.title && key === 'twitter:title')) {
            result.title = content;
          } else if (
            key === 'og:description' ||
            (!result.description && (key === 'twitter:description' || key === 'description'))
          ) {
            result.description = content;
          } else if (
            key === 'og:image' ||
            key === 'og:image:secure_url' ||
            (!result.image_url && key === 'twitter:image')
          ) {
            result.image_url = content;
          } else if (key === 'og:video' || key === 'og:video:url' || key === 'og:video:secure_url') {
            result.video_url = content;
          } else if (key === 'og:site_name') {
            result.site_name = content;
          } else if (key === 'article:tag' || key === 'video:tag') {
            const tag = content.replace(/^#/, '').toLowerCase();
            if (tag && !result.hashtags.includes(tag)) {
              result.hashtags.push(tag);
            }
          }
        }
      }

      // Fallback for title if no og:title
      if (!result.title) {
        const titleMatch = /<title[^>]*>([^<]+)<\/title>/i.exec(html);
        if (titleMatch && titleMatch[1]) {
          result.title = decodeHtmlEntities(titleMatch[1].trim());
        }
      }
    }

    // Extract hashtags from title, description and metadata
    const textToScan = `${result.title || ''} ${result.description || ''}`;
    const scannedHashtags = extractHashtags(textToScan);
    for (const h of scannedHashtags) {
      if (!result.hashtags.includes(h)) {
        result.hashtags.push(h);
      }
    }
  } catch (err: any) {
    logger.warn('Falha parcial ao raspar OpenGraph para link:', {
      url: targetUrl,
      error: err.message,
    });
  }

  // Ensure default title if empty
  if (!result.title) {
    try {
      const p = new URL(targetUrl);
      result.title = `${result.site_name || 'Link'} (${p.pathname.replace(/\/$/, '').split('/').pop() || p.hostname})`;
    } catch {
      result.title = targetUrl;
    }
  }

  return result;
}

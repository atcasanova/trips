import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export interface PexelsPhoto {
  id: number;
  width: number;
  height: number;
  url: string;
  photographer: string;
  photographer_url: string;
  photographer_id: number;
  avg_color: string;
  src: {
    original: string;
    large2x: string;
    large: string;
    medium: string;
    small: string;
    portrait: string;
    landscape: string;
    tiny: string;
  };
  alt: string;
}

export const pexelsService = {
  isConfigured(): boolean {
    return Boolean(env.PEXELS_API_KEY);
  },

  async searchPhotos(queryText: string, perPage: number = 15, page: number = 1): Promise<{
    photos: PexelsPhoto[];
    total_results: number;
    page: number;
    per_page: number;
  }> {
    if (!env.PEXELS_API_KEY) {
      logger.warn('PEXELS_API_KEY não configurada. Retornando fotos padrão de fallback.');
      return {
        photos: [
          {
            id: 2034335,
            width: 4000,
            height: 2667,
            url: 'https://www.pexels.com/photo/photo-of-pagoda-near-cherry-blossom-tree-2034335/',
            photographer: 'Bagewadi',
            photographer_url: 'https://www.pexels.com/@bagewadi',
            photographer_id: 1047463,
            avg_color: '#4B3D3D',
            src: {
              original: 'https://images.pexels.com/photos/2034335/pexels-photo-2034335.jpeg',
              large2x: 'https://images.pexels.com/photos/2034335/pexels-photo-2034335.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940',
              large: 'https://images.pexels.com/photos/2034335/pexels-photo-2034335.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
              medium: 'https://images.pexels.com/photos/2034335/pexels-photo-2034335.jpeg?auto=compress&cs=tinysrgb&h=350',
              small: 'https://images.pexels.com/photos/2034335/pexels-photo-2034335.jpeg?auto=compress&cs=tinysrgb&h=130',
              portrait: 'https://images.pexels.com/photos/2034335/pexels-photo-2034335.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=800',
              landscape: 'https://images.pexels.com/photos/2034335/pexels-photo-2034335.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200',
              tiny: 'https://images.pexels.com/photos/2034335/pexels-photo-2034335.jpeg?auto=compress&cs=tinysrgb&dpr=1&fit=crop&h=200&w=280',
            },
            alt: 'Pagoda near cherry blossom tree in Japan',
          },
          {
            id: 2837909,
            width: 3840,
            height: 2160,
            url: 'https://www.pexels.com/photo/las-vegas-strip-at-night-2837909/',
            photographer: 'David Vives',
            photographer_url: 'https://www.pexels.com/@davidvives',
            photographer_id: 1386121,
            avg_color: '#1A1826',
            src: {
              original: 'https://images.pexels.com/photos/2837909/pexels-photo-2837909.jpeg',
              large2x: 'https://images.pexels.com/photos/2837909/pexels-photo-2837909.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940',
              large: 'https://images.pexels.com/photos/2837909/pexels-photo-2837909.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
              medium: 'https://images.pexels.com/photos/2837909/pexels-photo-2837909.jpeg?auto=compress&cs=tinysrgb&h=350',
              small: 'https://images.pexels.com/photos/2837909/pexels-photo-2837909.jpeg?auto=compress&cs=tinysrgb&h=130',
              portrait: 'https://images.pexels.com/photos/2837909/pexels-photo-2837909.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=800',
              landscape: 'https://images.pexels.com/photos/2837909/pexels-photo-2837909.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200',
              tiny: 'https://images.pexels.com/photos/2837909/pexels-photo-2837909.jpeg?auto=compress&cs=tinysrgb&dpr=1&fit=crop&h=200&w=280',
            },
            alt: 'Las Vegas strip neon night skyline',
          },
        ],
        total_results: 2,
        page: 1,
        per_page: perPage,
      };
    }

    try {
      const url = new URL('https://api.pexels.com/v1/search');
      url.searchParams.append('query', queryText);
      url.searchParams.append('per_page', String(perPage));
      url.searchParams.append('page', String(page));
      url.searchParams.append('orientation', 'landscape');

      const res = await fetch(url.toString(), {
        headers: {
          Authorization: env.PEXELS_API_KEY,
        },
      });

      if (!res.ok) {
        throw new Error(`Pexels API respondeu com status ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();
      return data;
    } catch (err: any) {
      logger.error('Erro na chamada da API Pexels:', { error: err.message, query: queryText });
      return {
        photos: [],
        total_results: 0,
        page,
        per_page: perPage,
      };
    }
  },
};

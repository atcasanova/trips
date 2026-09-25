import { TripTheme } from '../types/index.js';

export interface ThemePreset {
  id: string;
  name: string;
  description: string;
  theme: TripTheme;
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'sakura',
    name: 'Sakura & Rose',
    description: 'Tons florais inspirados na primavera japonesa e cerejeiras em flor',
    theme: {
      preset: 'sakura',
      primary: '#b94a5d',
      secondary: '#d989a4',
      accent: '#fdf2f4',
      text: '#2f3941',
    },
  },
  {
    id: 'ocean',
    name: 'Ocean Breeze',
    description: 'Azuis profundos e tons marítimos para viagens de praia e ilhas',
    theme: {
      preset: 'ocean',
      primary: '#0369a1',
      secondary: '#38bdf8',
      accent: '#f0f9ff',
      text: '#0c4a6e',
    },
  },
  {
    id: 'sunset',
    name: 'Sunset Glow',
    description: 'Laranja terracota e âmbar para viagens de aventura e deserto',
    theme: {
      preset: 'sunset',
      primary: '#c2410c',
      secondary: '#fb923c',
      accent: '#fff7ed',
      text: '#431407',
    },
  },
  {
    id: 'forest',
    name: 'Alpine Forest',
    description: 'Verdes esmeralda e pinho para montanhas, ecoturismo e natureza',
    theme: {
      preset: 'forest',
      primary: '#15803d',
      secondary: '#4ade80',
      accent: '#f0fdf4',
      text: '#14532d',
    },
  },
  {
    id: 'cyber',
    name: 'Cyber & Tech',
    description: 'Neon cyan e grafite para congressos de segurança (Black Hat, DEF CON)',
    theme: {
      preset: 'cyber',
      primary: '#0284c7',
      secondary: '#06b6d4',
      accent: '#ecfeff',
      text: '#0f172a',
    },
  },
  {
    id: 'midnight',
    name: 'Midnight Luxury',
    description: 'Índigo profundo e toques dourados para viagens cosmopolitas e sofisticadas',
    theme: {
      preset: 'midnight',
      primary: '#4338ca',
      secondary: '#818cf8',
      accent: '#eef2ff',
      text: '#1e1b4b',
    },
  },
  {
    id: 'minimal',
    name: 'Editorial Minimal',
    description: 'Monocromático clean, elegância tipográfica e contrastes suaves',
    theme: {
      preset: 'minimal',
      primary: '#334155',
      secondary: '#94a3b8',
      accent: '#f8fafc',
      text: '#0f172a',
    },
  },
];

export function getThemePreset(id: string): TripTheme {
  const found = THEME_PRESETS.find((p) => p.id === id);
  return found ? found.theme : THEME_PRESETS[0].theme;
}

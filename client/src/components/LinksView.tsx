import React, { useState, useEffect, useMemo } from 'react';
import {
  Link2,
  Plus,
  Search,
  Filter,
  ExternalLink,
  Copy,
  Check,
  Trash2,
  Edit2,
  Sparkles,
  MapPin,
  Tag,
  Hash,
  Globe,
  Loader2,
  X,
  Share2,
  Compass,
  Utensils,
  Camera,
  Moon,
  Coffee,
  ShoppingBag,
  Hotel,
  Bus,
  Theater,
  Trees,
} from 'lucide-react';
import { Trip, TripLink, LinkPreviewResponse } from '../types/index.js';
import { api } from '../api/client.js';

interface LinksViewProps {
  trip: Trip;
  canEdit: boolean;
  primaryColor?: string;
}

// Popular themes with icons and colors
const THEMES = [
  { id: 'Restaurantes', label: 'Restaurantes', icon: Utensils, color: 'bg-amber-50 text-amber-700 border-amber-200' },
  { id: 'Atrações', label: 'Atrações', icon: Camera, color: 'bg-rose-50 text-rose-700 border-rose-200' },
  { id: 'Sightseeing', label: 'Sightseeing', icon: Compass, color: 'bg-sky-50 text-sky-700 border-sky-200' },
  { id: 'Nightlife', label: 'Nightlife', icon: Moon, color: 'bg-purple-50 text-purple-700 border-purple-200' },
  { id: 'Cafés & Bares', label: 'Cafés & Bares', icon: Coffee, color: 'bg-amber-100 text-amber-800 border-amber-300' },
  { id: 'Compras', label: 'Compras', icon: ShoppingBag, color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { id: 'Hospedagem', label: 'Hospedagem', icon: Hotel, color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  { id: 'Transporte & Dicas', label: 'Transporte & Dicas', icon: Bus, color: 'bg-blue-50 text-blue-700 border-blue-200' },
  { id: 'Cultura & Museus', label: 'Cultura & Museus', icon: Theater, color: 'bg-teal-50 text-teal-700 border-teal-200' },
  { id: 'Natureza & Parques', label: 'Natureza & Parques', icon: Trees, color: 'bg-green-50 text-green-700 border-green-200' },
  { id: 'Outros', label: 'Outros', icon: Tag, color: 'bg-slate-50 text-slate-700 border-slate-200' },
];

function decodeHtmlEntities(str: string): string {
  if (!str) return '';
  let decoded = str
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&copy;/g, '©')
    .replace(/&reg;/g, '®')
    .replace(/&trade;/g, '™')
    .replace(/&amp;/g, '&');

  decoded = decoded.replace(/&#x([0-9a-fA-F]+);?/gi, (_, hex) => {
    try {
      const code = parseInt(hex, 16);
      return !isNaN(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    } catch {
      return '';
    }
  });

  decoded = decoded.replace(/&#([0-9]+);?/g, (_, dec) => {
    try {
      const code = parseInt(dec, 10);
      return !isNaN(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    } catch {
      return '';
    }
  });

  return decoded;
}

const EMOJI_AND_SYMBOLS_REGEX =
  /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}]/gu;

/**
 * Truncate text to a maximum number of words, excluding emojis from the word count.
 * Emojis that appear within the text are preserved in their natural positions.
 */
function truncateTextByWords(
  text: string,
  maxWords: number = 60
): { text: string; isTruncated: boolean; wordCount: number } {
  if (!text) return { text: '', isTruncated: false, wordCount: 0 };

  const tokens = text.split(/(\s+)/);
  let wordCount = 0;
  const result: string[] = [];
  let isTruncated = false;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (/^\s+$/.test(token)) {
      result.push(token);
      continue;
    }

    const withoutEmojis = token.replace(EMOJI_AND_SYMBOLS_REGEX, '');
    const hasWordChars = /[\p{L}\p{N}]/u.test(withoutEmojis);

    if (hasWordChars) {
      if (wordCount >= maxWords) {
        isTruncated = true;
        break;
      }
      wordCount++;
    }

    result.push(token);
  }

  let output = result.join('').trimEnd();
  if (isTruncated) {
    output = output.replace(/[,;:\s.]+$/, '') + '...';
  }

  return { text: output, isTruncated, wordCount };
}

export const LinksView: React.FC<LinksViewProps> = ({ trip, canEdit, primaryColor = '#0f766e' }) => {
  const [links, setLinks] = useState<TripLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Available filters from backend
  const [availableFilters, setAvailableFilters] = useState<{
    countries: string[];
    cities: string[];
    themes: string[];
    hashtags: string[];
  }>({
    countries: [],
    cities: [],
    themes: [],
    hashtags: [],
  });

  // Filter states (support multi-select for cities and themes)
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCountry, setSelectedCountry] = useState('ALL');
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [selectedThemes, setSelectedThemes] = useState<string[]>([]);
  const [selectedHashtag, setSelectedHashtag] = useState('ALL');

  // New link form states
  const [inputUrl, setInputUrl] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState<LinkPreviewResponse | null>(null);
  const [savingLink, setSavingLink] = useState(false);

  // Form edit fields (multi-select for cities and themes)
  const [formCountry, setFormCountry] = useState('');
  const [formCities, setFormCities] = useState<string[]>([]);
  const [formThemes, setFormThemes] = useState<string[]>(['Sightseeing']);
  const [formNotes, setFormNotes] = useState('');
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formHashtags, setFormHashtags] = useState<string[]>([]);
  const [newCityInput, setNewCityInput] = useState('');
  const [showAddCityInput, setShowAddCityInput] = useState(false);

  // Modal for editing an existing link
  const [editingLink, setEditingLink] = useState<TripLink | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Detect trip cities from trip object
  const tripCities = useMemo(() => {
    let cities: string[] = [];
    if (Array.isArray(trip.cities)) {
      cities = trip.cities;
    } else if (typeof trip.cities === 'string') {
      try {
        cities = JSON.parse(trip.cities);
      } catch {}
    }
    if (cities.length === 0 && trip.destination_summary) {
      cities = trip.destination_summary.split(/[,•|]/).map((c) => c.trim()).filter(Boolean);
    }
    // Merge with available cities from saved links
    const merged = Array.from(new Set([...cities, ...availableFilters.cities]));
    return merged.filter(Boolean);
  }, [trip, availableFilters.cities]);

  // Load links with current filters
  const loadLinks = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.links.list(trip.id, {
        q: searchQuery,
        country: selectedCountry,
        cities: selectedCities,
        themes: selectedThemes,
        hashtag: selectedHashtag,
      });
      setLinks(res.links);
      setAvailableFilters(res.available_filters);
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar links');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLinks();
  }, [trip.id, selectedCountry, selectedCities, selectedThemes, selectedHashtag]);

  // Debounced search query
  useEffect(() => {
    const handler = setTimeout(() => {
      loadLinks();
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Preview link when user enters URL
  const handlePreviewLink = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputUrl.trim()) return;

    try {
      setPreviewLoading(true);
      setError(null);
      const data = await api.links.preview(trip.id, inputUrl.trim());
      setPreviewData(data);

      // Pre-fill fields with decoded HTML entities
      setFormTitle(decodeHtmlEntities(data.og.title || ''));
      setFormDescription(decodeHtmlEntities(data.og.description || ''));
      setFormHashtags(data.og.hashtags || []);

      // Pre-select country
      if (data.trip_destinations.primary_country) {
        setFormCountry(data.trip_destinations.primary_country);
      } else if (trip.primary_country) {
        setFormCountry(trip.primary_country);
      }

      // Default city to first detected city if available and not yet set
      if (data.trip_destinations.cities.length > 0) {
        setFormCities([data.trip_destinations.cities[0]]);
      } else if (tripCities.length > 0) {
        setFormCities([tripCities[0]]);
      } else {
        setFormCities([]);
      }

      // Default theme
      setFormThemes(['Sightseeing']);
      setFormNotes('');
    } catch (err: any) {
      setError(err.message || 'Erro ao analisar link');
    } finally {
      setPreviewLoading(false);
    }
  };

  // Save new link
  const handleSaveLink = async () => {
    if (!previewData && !inputUrl.trim()) return;
    try {
      setSavingLink(true);
      setError(null);

      await api.links.create(trip.id, {
        url: previewData?.url || inputUrl.trim(),
        country: formCountry || trip.primary_country || undefined,
        cities: formCities,
        city: formCities[0] || undefined,
        themes: formThemes.length > 0 ? formThemes : ['Sightseeing'],
        theme: formThemes[0] || 'Sightseeing',
        notes: formNotes || undefined,
        custom_title: formTitle || undefined,
        custom_description: formDescription || undefined,
        hashtags: formHashtags,
      });

      // Reset form
      setInputUrl('');
      setPreviewData(null);
      setFormNotes('');
      setFormCities([]);
      setFormThemes(['Sightseeing']);
      setNewCityInput('');
      setShowAddCityInput(false);

      // Reload links
      await loadLinks();
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar link');
    } finally {
      setSavingLink(false);
    }
  };

  // Cancel preview
  const handleCancelPreview = () => {
    setPreviewData(null);
    setInputUrl('');
    setFormNotes('');
    setFormCities([]);
    setFormThemes(['Sightseeing']);
    setShowAddCityInput(false);
  };

  // Copy cleaned link to clipboard
  const handleCopyCleanUrl = (linkId: string, url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedId(linkId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Delete link
  const handleDeleteLink = async (linkId: string) => {
    if (!confirm('Tem certeza que deseja excluir este link?')) return;
    try {
      await api.links.delete(trip.id, linkId);
      setLinks((prev) => prev.filter((l) => l.id !== linkId));
    } catch (err: any) {
      alert(err.message || 'Erro ao excluir link');
    }
  };

  // Open edit modal
  const handleOpenEdit = (l: TripLink) => {
    setEditingLink(l);
    setFormTitle(decodeHtmlEntities(l.title || ''));
    setFormDescription(decodeHtmlEntities(l.description || ''));
    setFormCountry(l.country || '');

    const existingCities = Array.isArray(l.cities) && l.cities.length > 0
      ? l.cities
      : (l.city ? [l.city] : []);
    setFormCities(existingCities);

    const existingThemes = Array.isArray(l.themes) && l.themes.length > 0
      ? l.themes
      : (l.theme ? [l.theme] : ['Sightseeing']);
    setFormThemes(existingThemes);

    setFormNotes(decodeHtmlEntities(l.notes || ''));
    setFormHashtags(l.hashtags || []);
    setNewCityInput('');
    setShowAddCityInput(false);
  };

  // Save edited link
  const handleSaveEdit = async () => {
    if (!editingLink) return;
    try {
      const res = await api.links.update(trip.id, editingLink.id, {
        title: formTitle,
        description: formDescription,
        country: formCountry,
        cities: formCities,
        city: formCities[0] || undefined,
        themes: formThemes.length > 0 ? formThemes : ['Sightseeing'],
        theme: formThemes[0] || 'Sightseeing',
        notes: formNotes,
        hashtags: formHashtags,
      });

      setLinks((prev) => prev.map((l) => (l.id === editingLink.id ? res.link : l)));
      setEditingLink(null);
    } catch (err: any) {
      alert(err.message || 'Erro ao atualizar link');
    }
  };

  // Substring client-side filter helper for ultra-smooth responsiveness
  const filteredLinks = useMemo(() => {
    return links.filter((l) => {
      // Multi-city filter
      if (selectedCities.length > 0) {
        const linkCities = Array.isArray(l.cities) && l.cities.length > 0
          ? l.cities
          : (l.city ? [l.city] : []);
        const matchesAnyCity = selectedCities.some((sc) => linkCities.includes(sc));
        if (!matchesAnyCity) return false;
      }

      // Multi-theme filter
      if (selectedThemes.length > 0) {
        const linkThemes = Array.isArray(l.themes) && l.themes.length > 0
          ? l.themes
          : (l.theme ? [l.theme] : []);
        const matchesAnyTheme = selectedThemes.some((st) => linkThemes.includes(st));
        if (!matchesAnyTheme) return false;
      }

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      const linkCitiesStr = Array.isArray(l.cities) ? l.cities.join(' ') : (l.city || '');
      const linkThemesStr = Array.isArray(l.themes) ? l.themes.join(' ') : (l.theme || '');

      const fullTitle = decodeHtmlEntities(l.title || '').toLowerCase();
      const fullDesc = decodeHtmlEntities(l.description || '').toLowerCase();
      const fullNotes = decodeHtmlEntities(l.notes || '').toLowerCase();

      return (
        fullTitle.includes(q) ||
        (l.title && l.title.toLowerCase().includes(q)) ||
        fullDesc.includes(q) ||
        (l.description && l.description.toLowerCase().includes(q)) ||
        fullNotes.includes(q) ||
        (l.notes && l.notes.toLowerCase().includes(q)) ||
        (l.url && l.url.toLowerCase().includes(q)) ||
        (l.site_name && l.site_name.toLowerCase().includes(q)) ||
        (l.country && l.country.toLowerCase().includes(q)) ||
        linkCitiesStr.toLowerCase().includes(q) ||
        linkThemesStr.toLowerCase().includes(q) ||
        (l.hashtags && l.hashtags.some((h) => h.toLowerCase().includes(q)))
      );
    });
  }, [links, searchQuery, selectedCities, selectedThemes]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* 1. Header & Quick Link Ingestion */}
      <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-slate-200 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-sm"
                style={{ backgroundColor: primaryColor }}
              >
                <Link2 className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                  Links & Inspirações
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                    {links.length} {links.length === 1 ? 'salvo' : 'salvos'}
                  </span>
                </h2>
                <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                  Catálogo inteligente de posts do Instagram, TikTok, YouTube e mapas com limpeza de URLs e tags
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Input bar to paste link */}
        {canEdit && (
          <div className="space-y-4">
            <form onSubmit={handlePreviewLink} className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <input
                  type="url"
                  placeholder="Cole aqui um link (Instagram, TikTok, YouTube, Maps, blog, etc.)..."
                  value={inputUrl}
                  onChange={(e) => setInputUrl(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 bg-slate-50 hover:bg-slate-100/80 focus:bg-white text-slate-800 text-sm rounded-xl border border-slate-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all outline-none"
                  required
                />
                <Link2 className="w-5 h-5 text-slate-400 absolute left-3.5 top-3.5 pointer-events-none" />
              </div>

              <button
                type="submit"
                disabled={previewLoading || !inputUrl.trim()}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white shadow-sm hover:opacity-90 active:scale-95 transition-all disabled:opacity-50 disabled:pointer-events-none"
                style={{ backgroundColor: primaryColor }}
              >
                {previewLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Analisando link...</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    <span>Adicionar Link</span>
                  </>
                )}
              </button>
            </form>

            {error && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center justify-between">
                <span>{error}</span>
                <button onClick={() => setError(null)} className="text-rose-500 hover:text-rose-700">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Preview & Categorization Card */}
            {previewData && (
              <div className="bg-slate-50/80 rounded-2xl p-5 border border-slate-200 space-y-5 animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="flex items-center justify-between border-b border-slate-200/80 pb-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-brand-600" />
                    Pré-visualização do Link & Metadados
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-medium text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                      <Check className="w-3 h-3" />
                      URL limpa (sem rastreadores)
                    </span>
                    <button onClick={handleCancelPreview} className="text-slate-400 hover:text-slate-600">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Thumbnail / Image preview */}
                  <div className="relative rounded-xl overflow-hidden bg-slate-200 aspect-video md:aspect-[4/3] flex items-center justify-center border border-slate-200 shadow-inner">
                    {previewData.og.image_url ? (
                      <img
                        src={previewData.og.image_url}
                        alt="Preview"
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="text-center p-4 text-slate-400">
                        <Camera className="w-8 h-8 mx-auto mb-1 opacity-50" />
                        <span className="text-xs">Sem miniatura detectada</span>
                      </div>
                    )}
                    {previewData.og.site_name && (
                      <span className="absolute top-2 left-2 bg-slate-900/80 backdrop-blur text-white text-[10px] font-bold px-2 py-0.5 rounded-md">
                        {previewData.og.site_name}
                      </span>
                    )}
                  </div>

                  {/* Form Details */}
                  <div className="md:col-span-2 space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Título</label>
                      <input
                        type="text"
                        value={formTitle}
                        onChange={(e) => setFormTitle(e.target.value)}
                        className="w-full px-3 py-2 bg-white text-slate-900 text-sm font-medium rounded-lg border border-slate-200 focus:ring-1 focus:ring-brand-500 outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Descrição</label>
                      <textarea
                        rows={2}
                        value={formDescription}
                        onChange={(e) => setFormDescription(e.target.value)}
                        className="w-full px-3 py-2 bg-white text-slate-700 text-xs rounded-lg border border-slate-200 focus:ring-1 focus:ring-brand-500 outline-none resize-none"
                      />
                    </div>

                    {/* Tagging: País, Cidade e Tema (Múltipla Seleção) */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Cidade Badges (multi-select) */}
                      <div className="space-y-1.5">
                        <label className="block text-xs font-semibold text-slate-700">
                          Cidades do Destino <span className="text-slate-400 font-normal">(selecione uma ou mais)</span>
                        </label>
                        <div className="flex flex-wrap gap-1.5">
                          {tripCities.map((c) => {
                            const isSelected = formCities.includes(c);
                            return (
                              <button
                                key={c}
                                type="button"
                                onClick={() => {
                                  setFormCities((prev) =>
                                    prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
                                  );
                                }}
                                className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-all flex items-center gap-1 ${
                                  isSelected
                                    ? 'bg-slate-900 text-white shadow-sm ring-2 ring-slate-900/20'
                                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                                }`}
                              >
                                <span>📍 {c}</span>
                                {isSelected && <Check className="w-3 h-3 ml-0.5" />}
                              </button>
                            );
                          })}

                          {!showAddCityInput ? (
                            <button
                              type="button"
                              onClick={() => setShowAddCityInput(true)}
                              className="text-xs px-2 py-1 rounded-lg text-slate-500 hover:text-slate-800 bg-white border border-dashed border-slate-300 hover:border-slate-400"
                            >
                              + Outra cidade
                            </button>
                          ) : (
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                placeholder="Nome da cidade"
                                value={newCityInput}
                                onChange={(e) => setNewCityInput(e.target.value)}
                                className="text-xs px-2 py-1 rounded-lg bg-white border border-slate-300 outline-none w-28"
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    const trimmed = newCityInput.trim();
                                    if (trimmed) {
                                      if (!formCities.includes(trimmed)) {
                                        setFormCities((prev) => [...prev, trimmed]);
                                      }
                                      setNewCityInput('');
                                      setShowAddCityInput(false);
                                    }
                                  }
                                }}
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const trimmed = newCityInput.trim();
                                  if (trimmed) {
                                    if (!formCities.includes(trimmed)) {
                                      setFormCities((prev) => [...prev, trimmed]);
                                    }
                                    setNewCityInput('');
                                    setShowAddCityInput(false);
                                  }
                                }}
                                className="text-xs px-2 py-1 bg-slate-900 text-white rounded-lg"
                              >
                                OK
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* País Badge */}
                      <div className="space-y-1.5">
                        <label className="block text-xs font-semibold text-slate-700">
                          País <span className="text-slate-400 font-normal">(pré-marcado)</span>
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={formCountry}
                            onChange={(e) => setFormCountry(e.target.value)}
                            placeholder="País (ex: Japão)"
                            className="px-3 py-1.5 bg-white text-slate-800 text-xs font-medium rounded-lg border border-slate-200 outline-none w-full max-w-[200px]"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Tema Badges (multi-select) */}
                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold text-slate-700">
                        Temas do Conteúdo <span className="text-slate-400 font-normal">(selecione um ou mais)</span>
                      </label>
                      <div className="flex flex-wrap gap-1.5">
                        {THEMES.map((t) => {
                          const isSelected = formThemes.includes(t.id);
                          const Icon = t.icon;
                          return (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => {
                                setFormThemes((prev) => {
                                  if (prev.includes(t.id)) {
                                    return prev.length > 1 ? prev.filter((x) => x !== t.id) : prev;
                                  }
                                  return [...prev, t.id];
                                });
                              }}
                              className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg font-medium transition-all ${
                                isSelected
                                  ? 'bg-brand-600 text-white shadow-sm ring-2 ring-brand-600/20'
                                  : `${t.color} border opacity-75 hover:opacity-100`
                              }`}
                              style={isSelected ? { backgroundColor: primaryColor } : undefined}
                            >
                              <Icon className="w-3.5 h-3.5" />
                              <span>{t.label}</span>
                              {isSelected && <Check className="w-3 h-3 ml-0.5" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Hashtags detectadas */}
                    {formHashtags.length > 0 && (
                      <div className="space-y-1">
                        <label className="block text-[11px] font-semibold text-slate-500">
                          Hashtags Detectadas ({formHashtags.length})
                        </label>
                        <div className="flex flex-wrap gap-1">
                          {formHashtags.map((h) => (
                            <span
                              key={h}
                              className="text-[11px] bg-sky-50 text-sky-700 px-2 py-0.5 rounded-md font-mono border border-sky-200"
                            >
                              #{h}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Notas do usuário */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Anotações ou Dicas Pessoais <span className="text-slate-400 font-normal">(opcional)</span>
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: Melhor prato é o wagyu, reservar com 2 semanas de antecedência..."
                        value={formNotes}
                        onChange={(e) => setFormNotes(e.target.value)}
                        className="w-full px-3 py-2 bg-white text-slate-800 text-xs rounded-lg border border-slate-200 focus:ring-1 focus:ring-brand-500 outline-none"
                      />
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center justify-end gap-3 pt-2">
                      <button
                        type="button"
                        onClick={handleCancelPreview}
                        className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveLink}
                        disabled={savingLink}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white shadow hover:opacity-90 transition-all disabled:opacity-50"
                        style={{ backgroundColor: primaryColor }}
                      >
                        {savingLink ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Salvando...</span>
                          </>
                        ) : (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>Salvar Link no Catálogo</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 2. Barra de Filtros & Pesquisa com Ajax (Substring Search) */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 space-y-4">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          {/* Substring Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              placeholder="Buscar por substring (ex: casa localiza casaco, casa e acasalamento)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-10 py-2.5 bg-slate-50 text-slate-900 text-xs sm:text-sm rounded-xl border border-slate-200 focus:bg-white focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all outline-none"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Quick Clear Filter Button */}
          {(searchQuery ||
            selectedCountry !== 'ALL' ||
            selectedCities.length > 0 ||
            selectedThemes.length > 0 ||
            selectedHashtag !== 'ALL') && (
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedCountry('ALL');
                setSelectedCities([]);
                setSelectedThemes([]);
                setSelectedHashtag('ALL');
              }}
              className="text-xs font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 px-3 py-2 rounded-xl border border-rose-200 transition-colors whitespace-nowrap self-start md:self-auto"
            >
              Limpar todos os filtros
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div className="space-y-3 pt-1 border-t border-slate-100">
          {/* Tema Pills (multi-select) */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap flex items-center gap-1">
              <Tag className="w-3 h-3" />
              Temas:
            </span>
            <button
              onClick={() => setSelectedThemes([])}
              className={`text-xs px-3 py-1 rounded-lg font-medium whitespace-nowrap transition-all ${
                selectedThemes.length === 0
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Todos ({links.length})
            </button>
            {THEMES.map((t) => {
              const isSelected = selectedThemes.includes(t.id);
              return (
                <button
                  key={t.id}
                  onClick={() => {
                    setSelectedThemes((prev) =>
                      prev.includes(t.id) ? prev.filter((x) => x !== t.id) : [...prev, t.id]
                    );
                  }}
                  className={`text-xs px-3 py-1 rounded-lg font-medium whitespace-nowrap transition-all flex items-center gap-1 ${
                    isSelected
                      ? 'bg-brand-600 text-white shadow-sm ring-2 ring-brand-600/20'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                  style={isSelected ? { backgroundColor: primaryColor } : undefined}
                >
                  <span>{t.label}</span>
                  {isSelected && <Check className="w-3 h-3" />}
                </button>
              );
            })}
          </div>

          {/* Cidades e Países Pills (multi-select) */}
          {(tripCities.length > 0 || availableFilters.countries.length > 0) && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                Cidades:
              </span>
              <button
                onClick={() => setSelectedCities([])}
                className={`text-xs px-3 py-1 rounded-lg font-medium whitespace-nowrap transition-all ${
                  selectedCities.length === 0
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Todas
              </button>
              {tripCities.map((city) => {
                const isSelected = selectedCities.includes(city);
                return (
                  <button
                    key={city}
                    onClick={() => {
                      setSelectedCities((prev) =>
                        prev.includes(city) ? prev.filter((x) => x !== city) : [...prev, city]
                      );
                    }}
                    className={`text-xs px-3 py-1 rounded-lg font-medium whitespace-nowrap transition-all flex items-center gap-1 ${
                      isSelected
                        ? 'bg-slate-900 text-white shadow-sm ring-2 ring-slate-900/20'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <span>📍 {city}</span>
                    {isSelected && <Check className="w-3 h-3" />}
                  </button>
                );
              })}
            </div>
          )}

          {/* Hashtags Populares */}
          {availableFilters.hashtags.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap flex items-center gap-1">
                <Hash className="w-3 h-3" />
                Hashtags:
              </span>
              <button
                onClick={() => setSelectedHashtag('ALL')}
                className={`text-xs px-2.5 py-0.5 rounded-md font-mono whitespace-nowrap transition-all ${
                  selectedHashtag === 'ALL'
                    ? 'bg-sky-600 text-white shadow-sm'
                    : 'bg-sky-50 text-sky-700 hover:bg-sky-100'
                }`}
              >
                #todas
              </button>
              {availableFilters.hashtags.slice(0, 15).map((h) => {
                const isSelected = selectedHashtag === h;
                return (
                  <button
                    key={h}
                    onClick={() => setSelectedHashtag(isSelected ? 'ALL' : h)}
                    className={`text-xs px-2.5 py-0.5 rounded-md font-mono whitespace-nowrap transition-all ${
                      isSelected
                        ? 'bg-sky-600 text-white shadow-sm'
                        : 'bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200/50'
                    }`}
                  >
                    #{h}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 3. Grid de Resultados */}
      {loading ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 space-y-3">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-slate-400" />
          <p className="text-sm text-slate-500">Carregando catálogo de links...</p>
        </div>
      ) : filteredLinks.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 space-y-3">
          <Link2 className="w-12 h-12 text-slate-300 mx-auto" />
          <h3 className="text-base font-bold text-slate-800">Nenhum link encontrado</h3>
          <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto">
            {searchQuery || selectedCities.length > 0 || selectedThemes.length > 0 || selectedHashtag !== 'ALL'
              ? 'Nenhum resultado corresponde aos filtros aplicados. Tente limpar os filtros para ver todos os itens.'
              : 'Comece colando links de reels do Instagram, vídeos do TikTok ou dicas no campo acima para salvar no seu roteiro!'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredLinks.map((link) => {
            const isCopied = copiedId === link.id;
            const cardCities = Array.isArray(link.cities) && link.cities.length > 0
              ? link.cities
              : (link.city ? [link.city] : []);
            const cardThemes = Array.isArray(link.themes) && link.themes.length > 0
              ? link.themes
              : (link.theme ? [link.theme] : []);

            const rawDecodedTitle = decodeHtmlEntities(link.title || link.url);
            const rawDecodedDesc = decodeHtmlEntities(link.description || '');

            // Truncate displayed text to max 60 words without counting emojis
            const { text: displayTitle, wordCount: titleWords } = truncateTextByWords(rawDecodedTitle, 60);
            const descWordLimit = Math.max(0, 60 - titleWords);
            const { text: displayDescription } = truncateTextByWords(
              rawDecodedDesc,
              descWordLimit > 0 ? descWordLimit : 15
            );

            return (
              <div
                key={link.id}
                className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col group"
              >
                {/* Media Image / Thumbnail Header (Clickable to post) */}
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="relative aspect-video bg-slate-900 overflow-hidden flex items-center justify-center cursor-pointer block group/thumb"
                  title="Abrir post em nova aba"
                  aria-label={`Abrir post: ${rawDecodedTitle}`}
                >
                  {link.image_url ? (
                    <img
                      src={link.image_url}
                      alt={rawDecodedTitle}
                      className="w-full h-full object-cover group-hover:scale-105 group-hover/thumb:scale-105 transition-transform duration-500"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="text-slate-500 flex flex-col items-center gap-1">
                      <Compass className="w-8 h-8 opacity-40" />
                      <span className="text-[11px] font-medium">Link Web</span>
                    </div>
                  )}

                  {/* Badges on top of media (pointer-events-none so click passes through to <a>) */}
                  <div className="absolute top-3 left-3 flex items-center gap-1.5 flex-wrap max-w-[70%] pointer-events-none">
                    {link.site_name && (
                      <span className="bg-slate-900/85 backdrop-blur text-white text-[10px] font-bold px-2 py-0.5 rounded-md shadow">
                        {link.site_name}
                      </span>
                    )}
                    {cardCities.map((c) => (
                      <span
                        key={c}
                        className="bg-white/90 backdrop-blur text-slate-900 text-[10px] font-bold px-2 py-0.5 rounded-md shadow flex items-center gap-1"
                      >
                        📍 {c}
                      </span>
                    ))}
                  </div>

                  {cardThemes.length > 0 && (
                    <div className="absolute top-3 right-3 flex items-center gap-1 flex-wrap justify-end max-w-[45%] pointer-events-none">
                      {cardThemes.map((t) => {
                        const themeConfig = THEMES.find((th) => th.id === t);
                        return (
                          <span
                            key={t}
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-md shadow ${
                              themeConfig ? themeConfig.color : 'bg-slate-800 text-white'
                            }`}
                          >
                            {t}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </a>

                {/* Content Body */}
                <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                  <div className="space-y-2">
                    {/* Title */}
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-bold text-slate-900 hover:text-brand-600 transition-colors flex items-start justify-between gap-1 group/title"
                      title={rawDecodedTitle}
                    >
                      <span className="leading-snug">{displayTitle}</span>
                      <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover/title:text-brand-600 shrink-0 mt-0.5" />
                    </a>

                    {/* Description */}
                    {displayDescription && (
                      <p className="text-xs text-slate-600 leading-relaxed" title={rawDecodedDesc}>
                        {displayDescription}
                      </p>
                    )}

                    {/* User Notes */}
                    {link.notes && (
                      <div className="p-2.5 bg-amber-50/80 rounded-xl border border-amber-200/60 text-xs text-amber-900 italic">
                        💡 {truncateTextByWords(decodeHtmlEntities(link.notes), 60).text}
                      </div>
                    )}

                    {/* Hashtags */}
                    {Array.isArray(link.hashtags) && link.hashtags.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {link.hashtags.slice(0, 6).map((h) => (
                          <button
                            key={h}
                            onClick={() => setSelectedHashtag(h)}
                            className="text-[10px] bg-slate-100 hover:bg-sky-50 text-slate-600 hover:text-sky-700 px-1.5 py-0.5 rounded font-mono transition-colors"
                          >
                            #{h}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Card Footer: Metadata and Actions */}
                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                    <span className="truncate max-w-[120px]" title={link.url}>
                      {new URL(link.url).hostname.replace('www.', '')}
                    </span>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleCopyCleanUrl(link.id, link.url)}
                        title="Copiar URL limpa"
                        className={`p-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1 ${
                          isCopied
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'hover:bg-slate-100 text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        {isCopied && <span className="text-[10px]">Copiado</span>}
                      </button>

                      {canEdit && (
                        <>
                          <button
                            onClick={() => handleOpenEdit(link)}
                            title="Editar informações"
                            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteLink(link.id)}
                            title="Excluir link"
                            className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 4. Modal de Edição de Link */}
      {editingLink && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">Editar Detalhes do Link</h3>
              <button onClick={() => setEditingLink(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Título</label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 text-slate-900 text-xs rounded-lg border border-slate-200 outline-none focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Descrição</label>
                <textarea
                  rows={2}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 text-slate-900 text-xs rounded-lg border border-slate-200 outline-none focus:bg-white resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">País</label>
                <input
                  type="text"
                  value={formCountry}
                  onChange={(e) => setFormCountry(e.target.value)}
                  placeholder="Ex: Japão"
                  className="w-full px-3 py-2 bg-slate-50 text-slate-900 text-xs rounded-lg border border-slate-200 outline-none focus:bg-white"
                />
              </div>

              {/* Cidades (Multi-select) */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700">
                  Cidades do Destino <span className="text-slate-400 font-normal">(selecione uma ou mais)</span>
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {Array.from(new Set([...tripCities, ...formCities])).map((c) => {
                    const isSelected = formCities.includes(c);
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => {
                          setFormCities((prev) =>
                            prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
                          );
                        }}
                        className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-all flex items-center gap-1 ${
                          isSelected
                            ? 'bg-slate-900 text-white shadow-sm ring-2 ring-slate-900/20'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200'
                        }`}
                      >
                        <span>📍 {c}</span>
                        {isSelected && <Check className="w-3 h-3 ml-0.5" />}
                      </button>
                    );
                  })}

                  {!showAddCityInput ? (
                    <button
                      type="button"
                      onClick={() => setShowAddCityInput(true)}
                      className="text-xs px-2 py-1 rounded-lg text-slate-500 hover:text-slate-800 bg-slate-50 border border-dashed border-slate-300 hover:border-slate-400"
                    >
                      + Outra cidade
                    </button>
                  ) : (
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        placeholder="Nome da cidade"
                        value={newCityInput}
                        onChange={(e) => setNewCityInput(e.target.value)}
                        className="text-xs px-2 py-1 rounded-lg bg-white border border-slate-300 outline-none w-28"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const trimmed = newCityInput.trim();
                            if (trimmed) {
                              if (!formCities.includes(trimmed)) {
                                setFormCities((prev) => [...prev, trimmed]);
                              }
                              setNewCityInput('');
                              setShowAddCityInput(false);
                            }
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const trimmed = newCityInput.trim();
                          if (trimmed) {
                            if (!formCities.includes(trimmed)) {
                              setFormCities((prev) => [...prev, trimmed]);
                            }
                            setNewCityInput('');
                            setShowAddCityInput(false);
                          }
                        }}
                        className="text-xs px-2 py-1 bg-slate-900 text-white rounded-lg"
                      >
                        OK
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Temas (Multi-select) */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700">
                  Temas do Conteúdo <span className="text-slate-400 font-normal">(selecione um ou mais)</span>
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {THEMES.map((t) => {
                    const isSelected = formThemes.includes(t.id);
                    const Icon = t.icon;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          setFormThemes((prev) => {
                            if (prev.includes(t.id)) {
                              return prev.length > 1 ? prev.filter((x) => x !== t.id) : prev;
                            }
                            return [...prev, t.id];
                          });
                        }}
                        className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg font-medium transition-all ${
                          isSelected
                            ? 'bg-brand-600 text-white shadow-sm ring-2 ring-brand-600/20'
                            : `${t.color} border opacity-75 hover:opacity-100`
                        }`}
                        style={isSelected ? { backgroundColor: primaryColor } : undefined}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        <span>{t.label}</span>
                        {isSelected && <Check className="w-3 h-3 ml-0.5" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Dica / Anotação Pessoal</label>
                <input
                  type="text"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 text-slate-900 text-xs rounded-lg border border-slate-200 outline-none focus:bg-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setEditingLink(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                className="px-5 py-2.5 rounded-xl text-xs font-bold text-white shadow hover:opacity-90 transition-all"
                style={{ backgroundColor: primaryColor }}
              >
                Salvar Alterações
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

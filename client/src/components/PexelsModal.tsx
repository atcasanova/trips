import React, { useState, useEffect } from 'react';
import { X, Search, Sparkles, Image, Check, ExternalLink, Loader2 } from 'lucide-react';
import { api } from '../api/client.js';
import { PexelsPhoto } from '../types/index.js';

interface PexelsModalProps {
  tripId: string;
  onSelect: (photoUrl: string, thumbUrl: string, attribution: any) => void;
  onClose: () => void;
}

export const PexelsModal: React.FC<PexelsModalProps> = ({ tripId, onSelect, onClose }) => {
  const [query, setQuery] = useState('');
  const [photos, setPhotos] = useState<PexelsPhoto[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<PexelsPhoto | null>(null);

  // Load AI query suggestions on open
  useEffect(() => {
    const fetchSuggestions = async () => {
      setLoadingSuggestions(true);
      try {
        const data = await api.ai.getPexelsSuggestions(tripId);
        if (data.queries && data.queries.length > 0) {
          setSuggestions(data.queries);
          setQuery(data.queries[0]);
          search(data.queries[0]);
        }
      } catch (err) {
        // Fallback default search
        setQuery('japan landscape');
        search('japan landscape');
      } finally {
        setLoadingSuggestions(false);
      }
    };
    fetchSuggestions();
  }, [tripId]);

  const search = async (searchQuery: string) => {
    if (!searchQuery.trim()) return;
    setLoading(true);
    try {
      const data = await api.pexels.search(searchQuery.trim(), 16);
      setPhotos(data.photos || []);
    } catch (err) {
      setPhotos([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    search(query);
  };

  const handleConfirm = () => {
    if (!selectedPhoto) return;
    onSelect(
      selectedPhoto.src.large2x || selectedPhoto.src.original,
      selectedPhoto.src.medium,
      {
        photographer: selectedPhoto.photographer,
        photographer_url: selectedPhoto.photographer_url,
        photo_url: selectedPhoto.url,
      }
    );
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full overflow-hidden border border-slate-200 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <Image className="w-5 h-5 text-brand-600" />
            <h2 className="text-lg font-bold text-slate-900">Escolher Capa no Pexels</h2>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search bar & AI Suggestions */}
        <div className="p-6 border-b border-slate-100 bg-white">
          <form onSubmit={handleSearchSubmit} className="flex gap-2 mb-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar fotos de alta resolução (ex: Tokyo skyline, Mount Fuji)..."
                className="w-full pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-brand-500 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm font-semibold shadow-sm transition-colors flex items-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Buscar'}
            </button>
          </form>

          {/* AI Suggestions Chips */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-slate-500 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" /> Sugestões da IA:
            </span>
            {loadingSuggestions && <span className="text-xs text-slate-400">Analisando viagem...</span>}
            {suggestions.map((s, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  setQuery(s);
                  search(s);
                }}
                className="px-2.5 py-1 bg-slate-100 hover:bg-brand-50 hover:text-brand-700 text-slate-700 rounded-full text-xs font-medium border border-slate-200 transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Photos Grid */}
        <div className="p-6 overflow-y-auto flex-1 bg-slate-50">
          {loading ? (
            <div className="py-20 text-center text-slate-400 flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
              <p className="text-sm">Buscando as melhores imagens no Pexels...</p>
            </div>
          ) : photos.length === 0 ? (
            <div className="py-16 text-center text-slate-400">
              <p className="text-sm">Nenhuma foto encontrada. Tente buscar com outros termos em inglês.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {photos.map((photo) => {
                const isSelected = selectedPhoto?.id === photo.id;
                return (
                  <div
                    key={photo.id}
                    onClick={() => setSelectedPhoto(photo)}
                    className={`group relative rounded-xl overflow-hidden cursor-pointer aspect-video border-2 transition-all ${
                      isSelected
                        ? 'border-brand-600 ring-4 ring-brand-500/20 scale-[1.02]'
                        : 'border-transparent hover:border-slate-300'
                    }`}
                  >
                    <img src={photo.src.medium} alt={photo.alt} className="w-full h-full object-cover" />
                    {isSelected && (
                      <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-brand-600 text-white flex items-center justify-center shadow-md">
                        <Check className="w-4 h-4" />
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-between text-[10px] text-white">
                      <span className="truncate">Por {photo.photographer}</span>
                      <a
                        href={photo.url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="hover:text-brand-300"
                        title="Ver no Pexels"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-white flex items-center justify-between">
          <div className="text-xs text-slate-500">
            {selectedPhoto ? (
              <span>
                Foto selecionada de <strong>{selectedPhoto.photographer}</strong>
              </span>
            ) : (
              'Clique em uma foto para selecionar como capa'
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirm}
              disabled={!selectedPhoto}
              className="px-5 py-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold shadow-sm transition-colors"
            >
              Definir como Capa
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

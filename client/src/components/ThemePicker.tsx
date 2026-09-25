import React, { useState } from 'react';
import { Palette, Check, Sparkles } from 'lucide-react';
import { TripTheme } from '../types/index.js';
import { THEME_PRESETS } from '../utils/themePresets.js';

interface ThemePickerProps {
  currentTheme: TripTheme;
  onSave: (theme: TripTheme) => void;
  onClose: () => void;
}

export const ThemePicker: React.FC<ThemePickerProps> = ({ currentTheme, onSave, onClose }) => {
  const [selectedPreset, setSelectedPreset] = useState<string>(currentTheme.preset || 'sakura');
  const [primary, setPrimary] = useState(currentTheme.primary || '#b94a5d');
  const [secondary, setSecondary] = useState(currentTheme.secondary || '#d989a4');
  const [accent, setAccent] = useState(currentTheme.accent || '#fdf2f4');

  const handleSelectPreset = (presetId: string) => {
    const found = THEME_PRESETS.find((p) => p.id === presetId);
    if (found) {
      setSelectedPreset(presetId);
      setPrimary(found.theme.primary);
      setSecondary(found.theme.secondary);
      setAccent(found.theme.accent);
    }
  };

  const handleApply = () => {
    onSave({
      preset: selectedPreset,
      primary,
      secondary,
      accent,
      text: '#2f3941',
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <Palette className="w-5 h-5 text-brand-600" />
            <h2 className="text-lg font-bold text-slate-900">Personalizar Tema Visual</h2>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700 rounded-lg">
            ✕
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Preset Palettes */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" /> Presets Temáticos
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {THEME_PRESETS.map((preset) => {
                const isSelected = selectedPreset === preset.id;
                return (
                  <div
                    key={preset.id}
                    onClick={() => handleSelectPreset(preset.id)}
                    className={`p-3 rounded-xl border-2 cursor-pointer transition-all ${
                      isSelected
                        ? 'border-brand-600 bg-brand-50/40 shadow-sm'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-xs text-slate-900">{preset.name}</span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-brand-600" />}
                    </div>
                    {/* Color Swatch Strip */}
                    <div className="flex items-center gap-1.5 h-4 w-full rounded-md overflow-hidden">
                      <div className="h-full flex-1" style={{ backgroundColor: preset.theme.primary }} />
                      <div className="h-full flex-1" style={{ backgroundColor: preset.theme.secondary }} />
                      <div className="h-full flex-1" style={{ backgroundColor: preset.theme.accent }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Custom Hex Color Pickers */}
          <div className="pt-4 border-t border-slate-100">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
              Ajuste Fino de Cores
            </label>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <span className="block text-xs text-slate-600 mb-1">Primária</span>
                <div className="flex items-center gap-2 border border-slate-300 rounded-lg p-1.5">
                  <input
                    type="color"
                    value={primary}
                    onChange={(e) => setPrimary(e.target.value)}
                    className="w-6 h-6 rounded cursor-pointer border-0"
                  />
                  <span className="text-xs font-mono text-slate-700">{primary}</span>
                </div>
              </div>
              <div>
                <span className="block text-xs text-slate-600 mb-1">Secundária</span>
                <div className="flex items-center gap-2 border border-slate-300 rounded-lg p-1.5">
                  <input
                    type="color"
                    value={secondary}
                    onChange={(e) => setSecondary(e.target.value)}
                    className="w-6 h-6 rounded cursor-pointer border-0"
                  />
                  <span className="text-xs font-mono text-slate-700">{secondary}</span>
                </div>
              </div>
              <div>
                <span className="block text-xs text-slate-600 mb-1">Destaque</span>
                <div className="flex items-center gap-2 border border-slate-300 rounded-lg p-1.5">
                  <input
                    type="color"
                    value={accent}
                    onChange={(e) => setAccent(e.target.value)}
                    className="w-6 h-6 rounded cursor-pointer border-0"
                  />
                  <span className="text-xs font-mono text-slate-700">{accent}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Live Preview Sample */}
          <div className="p-4 rounded-xl border border-slate-200" style={{ backgroundColor: accent }}>
            <span
              className="text-xs font-bold uppercase px-2 py-0.5 rounded text-white"
              style={{ backgroundColor: primary }}
            >
              Prévia Visual
            </span>
            <h4 className="font-serif text-lg font-bold mt-2" style={{ color: primary }}>
              Exemplo de Destaque Editorial
            </h4>
            <p className="text-xs text-slate-700 mt-1">
              Este tema será aplicado ao roteiro, cards, detalhes da viagem e no Trip Book PDF.
            </p>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-200 rounded-xl">
            Cancelar
          </button>
          <button
            onClick={handleApply}
            className="px-5 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm font-semibold shadow-sm transition-colors"
          >
            Aplicar Tema
          </button>
        </div>
      </div>
    </div>
  );
};

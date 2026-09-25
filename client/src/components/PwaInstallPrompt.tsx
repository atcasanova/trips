import React from 'react';
import { Download, X, Share, PlusSquare, Smartphone } from 'lucide-react';
import { usePwa } from '../context/PwaContext.js';

export const PwaInstallPrompt: React.FC = () => {
  const {
    isInstallable,
    isInstalled,
    showInstallBanner,
    dismissInstallBanner,
    promptInstall,
    showIOSInstructions,
    setShowIOSInstructions,
  } = usePwa();

  if (isInstalled) {
    return null;
  }

  return (
    <>
      {/* Floating Bottom Banner for Mobile/Chrome */}
      {showInstallBanner && isInstallable && (
        <aside
          role="complementary"
          aria-label="Instalação do aplicativo"
          className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-md z-50 bg-white rounded-2xl shadow-2xl border border-slate-200/80 p-4 transition-all duration-300 animate-in fade-in slide-in-from-bottom-5"
        >
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-brand-600 to-brand-400 flex items-center justify-center text-white shrink-0 shadow-md shadow-brand-500/25">
              <img
                src="/icons/icon-192x192.png"
                alt="Trips"
                className="w-12 h-12 rounded-xl object-cover"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            </div>

            <div className="flex-1 min-w-0 pr-2">
              <h4 className="text-sm font-bold text-slate-900 leading-tight">Instalar Trips</h4>
              <p className="text-xs text-slate-500 mt-0.5 leading-snug">
                Adicione à tela inicial para abrir seus roteiros e despesas em tela cheia com alta velocidade.
              </p>

              <div className="flex items-center gap-2 mt-3">
                <button
                  onClick={() => promptInstall()}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold rounded-lg shadow-sm shadow-brand-600/30 transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Instalar
                </button>
                <button
                  onClick={dismissInstallBanner}
                  className="px-2.5 py-1.5 text-slate-500 hover:text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Agora não
                </button>
              </div>
            </div>

            <button
              onClick={dismissInstallBanner}
              className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              title="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </aside>
      )}

      {/* iOS Instructions Modal */}
      {showIOSInstructions && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center text-brand-600">
                  <Smartphone className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-slate-900 text-base">Instalar no iPhone / iPad</h3>
              </div>
              <button
                onClick={() => setShowIOSInstructions(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-4 space-y-3.5 text-sm text-slate-600">
              <p className="text-xs text-slate-500">
                O Safari permite adicionar o Trips diretamente na tela de início:
              </p>

              <div className="flex items-start gap-3 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                <span className="w-6 h-6 rounded-full bg-brand-100 text-brand-700 font-bold text-xs flex items-center justify-center shrink-0">
                  1
                </span>
                <p className="text-xs text-slate-700">
                  Toque no botão <strong className="text-slate-900 inline-flex items-center gap-1 font-semibold"><Share className="w-3.5 h-3.5" /> Compartilhar</strong> na barra do Safari.
                </p>
              </div>

              <div className="flex items-start gap-3 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                <span className="w-6 h-6 rounded-full bg-brand-100 text-brand-700 font-bold text-xs flex items-center justify-center shrink-0">
                  2
                </span>
                <p className="text-xs text-slate-700">
                  Role a lista e selecione <strong className="text-slate-900 inline-flex items-center gap-1 font-semibold"><PlusSquare className="w-3.5 h-3.5" /> Adicionar à Tela de Início</strong>.
                </p>
              </div>

              <div className="flex items-start gap-3 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                <span className="w-6 h-6 rounded-full bg-brand-100 text-brand-700 font-bold text-xs flex items-center justify-center shrink-0">
                  3
                </span>
                <p className="text-xs text-slate-700">
                  Toque em <strong className="text-brand-600 font-bold">Adicionar</strong> no canto superior direito.
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowIOSInstructions(false)}
              className="w-full mt-2 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition-colors cursor-pointer"
            >
              Entendi
            </button>
          </div>
        </div>
      )}
    </>
  );
};

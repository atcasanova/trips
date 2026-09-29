import React, { useState, useEffect } from 'react';
import {
  BookOpen,
  Download,
  Printer,
  ExternalLink,
  Layers,
  Eye,
  Share2,
  Copy,
  Check,
  RefreshCw,
  Lock,
  Globe,
  ShieldCheck,
  EyeOff,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Trip } from '../types/index.js';
import { api } from '../api/client.js';

interface ReportEditorViewProps {
  trip: Trip;
  canEdit?: boolean;
}

export const ReportEditorView: React.FC<ReportEditorViewProps> = ({ trip, canEdit = true }) => {
  const [downloading, setDownloading] = useState(false);
  const [shareData, setShareData] = useState<{
    share_token: string | null;
    share_enabled: boolean;
    share_url: string;
  } | null>(null);
  const [loadingShare, setLoadingShare] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [showSharePanel, setShowSharePanel] = useState(false);

  const [sections, setSections] = useState({
    cover: true,
    overview: true,
    calendar: true,
    climatePacking: true,
    dayByDay: true,
    transports: true,
    hotels: true,
    checklist: true,
  });

  const loadShareStatus = async () => {
    try {
      setLoadingShare(true);
      const res = await api.reports.getShareStatus(trip.id);
      setShareData(res);
    } catch (err: any) {
      console.error('Erro ao carregar compartilhamento:', err);
    } finally {
      setLoadingShare(false);
    }
  };

  useEffect(() => {
    loadShareStatus();
  }, [trip.id]);

  const handleToggleShare = async () => {
    if (!shareData) return;
    try {
      setLoadingShare(true);
      const res = await api.reports.updateShare(trip.id, {
        enabled: !shareData.share_enabled,
      });
      setShareData(res);
    } catch (err: any) {
      alert(err.message || 'Erro ao alterar compartilhamento');
    } finally {
      setLoadingShare(false);
    }
  };

  const handleRegenerateToken = async () => {
    if (
      !window.confirm(
        'Deseja gerar um novo link de compartilhamento? O link anterior deixará de funcionar imediatamente.'
      )
    ) {
      return;
    }
    try {
      setLoadingShare(true);
      const res = await api.reports.updateShare(trip.id, {
        regenerate: true,
        enabled: true,
      });
      setShareData(res);
      setCopySuccess(false);
    } catch (err: any) {
      alert(err.message || 'Erro ao gerar novo link');
    } finally {
      setLoadingShare(false);
    }
  };

  const handleCopyLink = async () => {
    if (!shareData?.share_url) return;
    try {
      await navigator.clipboard.writeText(shareData.share_url);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2500);
    } catch {
      alert('Não foi possível copiar automaticamente. Selecione e copie o link no campo.');
    }
  };

  const toggleSection = (key: keyof typeof sections) => {
    setSections({ ...sections, [key]: !sections[key] });
  };

  const handleDownloadPdf = async () => {
    setDownloading(true);
    try {
      const url = api.reports.getPdfUrl(trip.id);
      window.open(url, '_blank');
    } catch (err: any) {
      alert(err.message || 'Erro ao gerar PDF');
    } finally {
      setDownloading(false);
    }
  };

  const printHtmlUrl = api.reports.getHtmlUrl(trip.id);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-brand-600" />
            <h2 className="text-xl font-bold font-serif text-slate-900">Trip Book & Relatório Editorial</h2>
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Geração de dossiê completo de viagem formatado para papel A4 e web, integrando identidade visual, mapas diários, timeline, reservas de voos e hotéis.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowSharePanel(!showSharePanel)}
            className={`flex items-center gap-1.5 px-3.5 py-2 border rounded-xl text-xs font-semibold transition-colors ${
              shareData?.share_enabled
                ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Share2 className="w-4 h-4 text-emerald-600" />
            <span>Compartilhar Link</span>
            {shareData?.share_enabled && (
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse ml-0.5" />
            )}
            {showSharePanel ? <ChevronUp className="w-3.5 h-3.5 ml-0.5" /> : <ChevronDown className="w-3.5 h-3.5 ml-0.5" />}
          </button>

          <a
            href={printHtmlUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 px-4 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold transition-colors"
          >
            <Printer className="w-4 h-4 text-slate-500" />
            Versão para Impressão
          </a>

          <button
            onClick={handleDownloadPdf}
            disabled={downloading}
            className="flex items-center gap-1.5 px-5 py-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-sm transition-colors"
          >
            <Download className="w-4 h-4" />
            {downloading ? 'Renderizando PDF...' : 'Baixar Trip Book em PDF (A4)'}
          </button>
        </div>
      </div>

      {/* Public Share Panel Card */}
      {showSharePanel && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4 animate-in fade-in duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                <Globe className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Compartilhar Trip Book com Link Único</h3>
                <p className="text-xs text-slate-500">
                  Permite que pessoas de fora da viagem vejam o roteiro e mini-mapas com dados pessoais anonimizados.
                </p>
              </div>
            </div>

            {canEdit && (
              <div className="flex items-center gap-2">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={shareData?.share_enabled || false}
                    onChange={handleToggleShare}
                    disabled={loadingShare}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                </label>
                <span className="text-xs font-semibold text-slate-700">
                  {shareData?.share_enabled ? 'Compartilhamento Ativo' : 'Desativado'}
                </span>
              </div>
            )}
          </div>

          {shareData?.share_enabled ? (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    readOnly
                    value={shareData.share_url}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-700 font-mono select-all focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-colors cursor-pointer"
                  >
                    {copySuccess ? <Check className="w-4 h-4 text-emerald-200" /> : <Copy className="w-4 h-4" />}
                    <span>{copySuccess ? 'Link Copiado!' : 'Copiar Link'}</span>
                  </button>

                  <a
                    href={shareData.share_url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2.5 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold transition-colors"
                    title="Testar visualização pública"
                  >
                    <ExternalLink className="w-4 h-4 text-slate-500" />
                    <span>Visualizar</span>
                  </a>

                  {canEdit && (
                    <button
                      type="button"
                      onClick={handleRegenerateToken}
                      disabled={loadingShare}
                      className="p-2.5 border border-slate-300 hover:bg-slate-50 text-slate-600 rounded-xl transition-colors cursor-pointer"
                      title="Gerar novo link (invalida o link anterior)"
                    >
                      <RefreshCw className={`w-4 h-4 ${loadingShare ? 'animate-spin' : ''}`} />
                    </button>
                  )}
                </div>
              </div>

              {/* Privacy guarantees grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <div className="p-3 bg-emerald-50/60 border border-emerald-200/70 rounded-xl flex items-start gap-2.5">
                  <EyeOff className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                  <div className="text-[11px] leading-relaxed text-emerald-950">
                    <strong>Dados Anonimizados:</strong> Nomes de passageiros e localizadores de voo/hotel são ocultados ou mascarados como <code>Viajante(s)</code> e <code>******</code>.
                  </div>
                </div>

                <div className="p-3 bg-sky-50/60 border border-sky-200/70 rounded-xl flex items-start gap-2.5">
                  <ShieldCheck className="w-4 h-4 text-sky-700 shrink-0 mt-0.5" />
                  <div className="text-[11px] leading-relaxed text-sky-950">
                    <strong>Não Indexável no Google:</strong> Possui meta tag <code>noindex, nofollow</code> e cabeçalho <code>X-Robots-Tag</code> para impedir busca pública.
                  </div>
                </div>

                <div className="p-3 bg-purple-50/60 border border-purple-200/70 rounded-xl flex items-start gap-2.5">
                  <Lock className="w-4 h-4 text-purple-700 shrink-0 mt-0.5" />
                  <div className="text-[11px] leading-relaxed text-purple-950">
                    <strong>Link Criptográfico Único:</strong> Acesso somente por quem tiver a URL completa gerada aleatoriamente. Pode ser revogado a qualquer momento.
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 flex items-center justify-between">
              <span>O compartilhamento público está desativado. Nenhuma pessoa externa consegue acessar este Trip Book.</span>
              {canEdit && (
                <button
                  type="button"
                  onClick={handleToggleShare}
                  disabled={loadingShare}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold text-xs transition-colors"
                >
                  Ativar Compartilhamento
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Sections Config & Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left Column: Sections Configuration */}
        <div className="lg:col-span-1 bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-brand-600" /> Seções do Relatório
          </h3>

          <div className="space-y-2.5 text-xs text-slate-700">
            {[
              { id: 'cover', label: 'Capa Editorial & Tema' },
              { id: 'overview', label: 'Visão Geral & Janela Sazonal' },
              { id: 'calendar', label: 'Calendário Rápido de Bases' },
              { id: 'climatePacking', label: 'Clima, Mala & Dicas' },
              { id: 'dayByDay', label: 'Roteiro Ilustrado & Mini-Mapas' },
              { id: 'transports', label: 'Transportes & Voos (PNR)' },
              { id: 'hotels', label: 'Hospedagens & Vouchers' },
              { id: 'checklist', label: 'Checklist Final de Viagem' },
            ].map((sec) => (
              <label key={sec.id} className="flex items-center gap-2 cursor-pointer p-1.5 rounded hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={(sections as any)[sec.id]}
                  onChange={() => toggleSection(sec.id as any)}
                  className="rounded text-brand-600 focus:ring-brand-500"
                />
                <span className="font-medium">{sec.label}</span>
              </label>
            ))}
          </div>

          <div className="pt-4 border-t border-slate-100 text-[11px] text-slate-400">
            O documento respeita o padrão gráfico editorial (com paleta customizável por viagem, mini-mapas estáticos OpenStreetMap por dia e layout A4 para impressão).
          </div>
        </div>

        {/* Right Column: Embedded Live Preview Frame */}
        <div className="lg:col-span-3 bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm flex flex-col h-[750px]">
          <div className="px-4 py-2.5 bg-slate-100 border-b border-slate-200 flex items-center justify-between text-xs text-slate-600">
            <span className="font-semibold flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5 text-brand-600" /> Pré-visualização do Relatório / Trip Book
            </span>
            <a
              href={printHtmlUrl}
              target="_blank"
              rel="noreferrer"
              className="text-brand-600 hover:underline flex items-center gap-1 font-medium"
            >
              Abrir em Tela Cheia <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <iframe
            src={printHtmlUrl}
            title="Trip Book Preview"
            className="w-full flex-1 border-0 bg-white"
          />
        </div>
      </div>
    </div>
  );
};

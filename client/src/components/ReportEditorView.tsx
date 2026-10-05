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
  Globe,
  ChevronDown,
  ChevronUp,
  Zap,
  CheckCircle2,
  Clock,
  AlertCircle,
  X,
} from 'lucide-react';
import { Trip, PdfStatusResponse } from '../types/index.js';
import { api } from '../api/client.js';

interface ReportEditorViewProps {
  trip: Trip;
  canEdit?: boolean;
}

export const ReportEditorView: React.FC<ReportEditorViewProps> = ({ trip, canEdit = true }) => {
  const [downloading, setDownloading] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [pdfStatus, setPdfStatus] = useState<PdfStatusResponse | null>(null);
  const [loadingPdfStatus, setLoadingPdfStatus] = useState(false);
  const [regeneratingPdf, setRegeneratingPdf] = useState(false);
  const [shareData, setShareData] = useState<{
    share_token: string | null;
    share_enabled: boolean;
    share_url: string;
  } | null>(null);
  const [loadingShare, setLoadingShare] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [showSharePanel, setShowSharePanel] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false);

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

  const loadPdfStatus = async () => {
    try {
      setLoadingPdfStatus(true);
      const res = await api.reports.getPdfStatus(trip.id);
      setPdfStatus(res);
    } catch (err: any) {
      console.error('Erro ao carregar status do PDF:', err);
    } finally {
      setLoadingPdfStatus(false);
    }
  };

  useEffect(() => {
    loadShareStatus();
    loadPdfStatus();
  }, [trip.id]);

  const handleToggleShare = async () => {
    if (!shareData) return;
    try {
      setLoadingShare(true);
      setErrorMessage(null);
      const res = await api.reports.updateShare(trip.id, {
        enabled: !shareData.share_enabled,
      });
      setShareData(res);
      loadPdfStatus();
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao alterar compartilhamento');
    } finally {
      setLoadingShare(false);
    }
  };

  const handleRegenerateToken = () => {
    setShowRegenerateConfirm(true);
  };

  const handleConfirmRegenerateToken = async () => {
    setShowRegenerateConfirm(false);
    try {
      setLoadingShare(true);
      setErrorMessage(null);
      const res = await api.reports.updateShare(trip.id, {
        regenerate: true,
        enabled: true,
      });
      setShareData(res);
      setCopySuccess(false);
      loadPdfStatus();
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao gerar novo link');
    } finally {
      setLoadingShare(false);
    }
  };

  const handleRegeneratePdf = async () => {
    try {
      setRegeneratingPdf(true);
      setErrorMessage(null);
      const res = await api.reports.regeneratePdf(trip.id);
      setPdfStatus(res.status);
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao regenerar PDFs do Trip Book');
    } finally {
      setRegeneratingPdf(false);
    }
  };

  const handleCopyLink = async () => {
    if (!shareData?.share_url) return;
    try {
      await navigator.clipboard.writeText(shareData.share_url);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2500);
    } catch {
      setErrorMessage('Não foi possível copiar automaticamente. Selecione e copie o link no campo.');
    }
  };

  const toggleSection = (key: keyof typeof sections) => {
    setSections({ ...sections, [key]: !sections[key] });
  };

  const handleDownloadPdf = async () => {
    setDownloading(true);
    setDownloadSuccess(false);
    setErrorMessage(null);
    try {
      const filename = `TripBook_${trip.title.replace(/[^a-zA-Z0-9]/g, '_')}_completo.pdf`;
      await api.reports.downloadPdf(trip.id, filename);
      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 3500);
      loadPdfStatus();
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao gerar/baixar PDF');
    } finally {
      setDownloading(false);
    }
  };

  const printHtmlUrl = api.reports.getHtmlUrl(trip.id);

  return (
    <div className="space-y-6">
      {/* Banner de Erro Inline */}
      {errorMessage && (
        <div className="flex items-center justify-between p-4 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-800 animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-red-400 hover:text-red-700 ml-3 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Top Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-brand-600" />
            <h2 className="text-xl font-bold font-serif text-slate-900">Trip Book</h2>
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Geração de dossiê completo de viagem formatado para papel A4 e web, integrando identidade visual, mapas diários, timeline, reservas de voos e hotéis.
          </p>

          {/* Pre-generated PDF status pill */}
          <div className="flex items-center gap-2 mt-3 pt-2.5 border-t border-slate-100 flex-wrap">
            {pdfStatus?.hasPreGenerated ? (
              <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                <Zap className="w-3.5 h-3.5 text-emerald-600 fill-emerald-500" />
                <span className="font-semibold">PDF Pré-gerado Pronto</span>
                <span className="text-emerald-600">({pdfStatus.fullSizeFormatted || '10 MB'})</span>
                {pdfStatus.fullGeneratedAt && (
                  <span className="text-emerald-500 hidden sm:inline">
                    • {new Date(pdfStatus.fullGeneratedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>
            ) : pdfStatus?.isGenerating || regeneratingPdf ? (
              <div className="flex items-center gap-1.5 text-xs text-sky-700 bg-sky-50 px-2.5 py-1 rounded-lg border border-sky-200">
                <RefreshCw className="w-3.5 h-3.5 text-sky-600 animate-spin" />
                <span className="font-semibold">Gerando PDF em segundo plano...</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200">
                <Clock className="w-3.5 h-3.5 text-amber-600" />
                <span>Aguardando geração do PDF</span>
              </div>
            )}

            {canEdit && (
              <button
                type="button"
                onClick={handleRegeneratePdf}
                disabled={regeneratingPdf || downloading}
                title="Forçar atualização e re-renderização dos arquivos PDF"
                className="flex items-center gap-1 text-[11px] font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 px-2 py-1 rounded-lg transition-colors cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 ${regeneratingPdf ? 'animate-spin' : ''}`} />
                <span>{regeneratingPdf ? 'Regenerando...' : 'Regenerar PDF'}</span>
              </button>
            )}
          </div>
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
            className={`flex items-center gap-1.5 px-5 py-2 disabled:opacity-75 text-white rounded-xl text-xs font-semibold shadow-sm transition-all cursor-pointer ${
              downloadSuccess
                ? 'bg-emerald-600 hover:bg-emerald-700'
                : 'bg-brand-600 hover:bg-brand-700'
            }`}
          >
            {downloading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Baixando PDF...</span>
              </>
            ) : downloadSuccess ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-white" />
                <span>Download Concluído!</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                <span>Baixar Trip Book em PDF (A4)</span>
              </>
            )}
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

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div className="flex items-center gap-2 text-slate-600">
                  <Zap className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <span>
                    <strong>Versão PDF Anonimizada:</strong> Pronta para download público imediato ({pdfStatus?.anonSizeFormatted || 'otimizada'}).
                  </span>
                </div>
                <a
                  href={`${shareData.share_url}/pdf`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 font-medium text-emerald-700 hover:text-emerald-800 hover:underline flex-shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Testar Download do PDF</span>
                </a>
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
            <Layers className="w-4 h-4 text-brand-600" /> Seções do Trip Book
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
              <Eye className="w-3.5 h-3.5 text-brand-600" /> Pré-visualização do Trip Book
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

      {/* Modal de Confirmação de Regeneração de Link */}
      {showRegenerateConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-amber-600 mb-4">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                <RefreshCw className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Novo Link de Compartilhamento</h3>
                <p className="text-xs text-slate-500">Invalidação de link ativo</p>
              </div>
            </div>

            <p className="text-sm text-slate-600 mb-5">
              Deseja gerar um novo link de compartilhamento? O link anterior deixará de funcionar imediatamente para qualquer pessoa que o tenha recebido.
            </p>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowRegenerateConfirm(false)}
                disabled={loadingShare}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmRegenerateToken}
                disabled={loadingShare}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-md shadow-amber-500/20 transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                {loadingShare ? 'Gerando...' : 'Sim, Gerar Novo Link'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

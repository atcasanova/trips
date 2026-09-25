import React, { useState } from 'react';
import { BookOpen, Download, Printer, ExternalLink, Sparkles, CheckSquare, Layers, Eye } from 'lucide-react';
import { Trip } from '../types/index.js';
import { api } from '../api/client.js';

interface ReportEditorViewProps {
  trip: Trip;
}

export const ReportEditorView: React.FC<ReportEditorViewProps> = ({ trip }) => {
  const [downloading, setDownloading] = useState(false);
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
            Geração de dossiê completo de viagem formatado para papel A4 e web, integrando identidade visual, fotos temáticas, timeline diária, reservas de voos e hotéis.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
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
              { id: 'dayByDay', label: 'Roteiro Ilustrado Dia a Dia' },
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
            O documento respeita o padrão gráfico do arquivo de referência DOCX (com paleta customizável por viagem, caixas de alerta e layout para impressão).
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

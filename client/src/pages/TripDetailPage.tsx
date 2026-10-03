import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Calendar,
  MapPin,
  FileText,
  Users,
  Palette,
  Image,
  BookOpen,
  ArrowLeft,
  Share2,
  Clock,
  Sparkles,
  Plane,
  Building,
  DollarSign,
  Layers,
  ShieldCheck,
  CheckCircle2,
  Scale,
  ArrowRight,
  Check,
  Trash2,
  Route,
  Info,
} from 'lucide-react';
import {
  Trip,
  TripDay,
  TransportReservation,
  HotelReservation,
  DocumentItem,
  TripMember,
  TripTraveler,
  ExpensesResponse,
} from '../types/index.js';
import { api } from '../api/client.js';
import { formatDateRange } from '../utils/date.js';
import { MacroTimelineView } from '../components/MacroTimelineView.js';
import { TimelineView } from '../components/TimelineView.js';
import { TransportsView } from '../components/TransportsView.js';
import { HotelsView } from '../components/HotelsView.js';
import { DocumentsView } from '../components/DocumentsView.js';
import { ExpensesView } from '../components/ExpensesView.js';
import { ReportEditorView } from '../components/ReportEditorView.js';
import { ThemePicker } from '../components/ThemePicker.js';
import { PexelsModal } from '../components/PexelsModal.js';
import { MembersModal } from '../components/MembersModal.js';
import { DeleteTripModal } from '../components/DeleteTripModal.js';
import { useAuth } from '../context/AuthContext.js';

const VALID_TABS = [
  'overview',
  'timeline',
  'itinerary',
  'transports',
  'hotels',
  'documents',
  'expenses',
  'report',
] as const;
type TabType = (typeof VALID_TABS)[number];

export const TripDetailPage: React.FC = () => {
  const { id, tab } = useParams<{ id: string; tab?: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [trip, setTrip] = useState<Trip | null>(null);
  const [members, setMembers] = useState<TripMember[]>([]);
  const [travelers, setTravelers] = useState<TripTraveler[]>([]);
  const [days, setDays] = useState<TripDay[]>([]);
  const [transports, setTransports] = useState<TransportReservation[]>([]);
  const [hotels, setHotels] = useState<HotelReservation[]>([]);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [expensesData, setExpensesData] = useState<ExpensesResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // Active tab state - synchronized with URL
  const initialTab: TabType = tab && VALID_TABS.includes(tab as TabType) ? (tab as TabType) : 'overview';
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  const [copiedLink, setCopiedLink] = useState(false);

  // Modals
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [showPexelsModal, setShowPexelsModal] = useState(false);
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const tripId = id || '';

  // Synchronize tab state with URL parameter if it changes
  useEffect(() => {
    if (tab && VALID_TABS.includes(tab as TabType) && tab !== activeTab) {
      setActiveTab(tab as TabType);
    }
  }, [tab]);

  const handleTabChange = (newTab: TabType) => {
    setActiveTab(newTab);
    navigate(`/trips/${tripId}/${newTab}`, { replace: false });
    // Fresh background sync on tab switch to avoid desync
    if (tripId) {
      Promise.all([
        api.trips.get(tripId).catch(() => null),
        api.reservations.listHotels(tripId).catch(() => null),
        api.reservations.listTransports(tripId).catch(() => null),
        api.documents.list(tripId).catch(() => null),
        api.trips.listTravelers(tripId).catch(() => null),
      ]).then(([tRes, hRes, trRes, dRes, tvRes]) => {
        if (tRes?.trip) {
          setTrip(tRes.trip);
          setMembers(tRes.trip.members || []);
        }
        if (hRes?.hotels) setHotels(hRes.hotels);
        if (trRes?.transports) setTransports(trRes.transports);
        if (dRes?.documents) setDocuments(dRes.documents);
        if (tvRes?.travelers) setTravelers(tvRes.travelers);
      });
    }
  };

  const handleCopyTabLink = () => {
    const url = `${window.location.origin}/trips/${tripId}/${activeTab}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const loadAllTripData = async () => {
    if (!tripId) return;
    try {
      setLoading(true);
      const [tripRes, daysRes, transRes, hotelsRes, docsRes, expRes, travelersRes] = await Promise.all([
        api.trips.get(tripId),
        api.days.list(tripId),
        api.reservations.listTransports(tripId),
        api.reservations.listHotels(tripId),
        api.documents.list(tripId),
        api.expenses.list(tripId).catch(() => null),
        api.trips.listTravelers(tripId).catch(() => ({ travelers: [] })),
      ]);

      setTrip(tripRes.trip);
      setMembers(tripRes.trip.members || []);
      setTravelers(travelersRes.travelers || []);
      setDays(daysRes.days || []);
      setTransports(transRes.transports || []);
      setHotels(hotelsRes.hotels || []);
      setDocuments(docsRes.documents || []);
      if (expRes) setExpensesData(expRes);
    } catch (err: any) {
      console.error(err);
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllTripData();
  }, [tripId]);

  if (loading || !trip) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-400 text-sm">
        Carregando informações da viagem...
      </div>
    );
  }

  const primaryColor = trip.theme?.primary || '#b94a5d';
  const canEdit = trip.user_role === 'OWNER' || trip.user_role === 'EDITOR' || user?.role === 'ADMIN';
  const canManage = trip.user_role === 'OWNER' || user?.role === 'ADMIN';

  const dateRangeDisplay = formatDateRange(trip.start_date, trip.end_date);

  const handleUpdateTheme = async (newTheme: any) => {
    try {
      await api.trips.update(trip.id, { theme: newTheme });
      loadAllTripData();
    } catch (err: any) {
      alert(err.message || 'Erro ao salvar tema');
    }
  };

  const handleSelectCover = async (
    photoOrUrl: any,
    thumbUrl?: string,
    attribution?: any
  ) => {
    try {
      let coverUrl = '';
      let coverThumb = '';
      let coverAttr: any = attribution || null;

      if (typeof photoOrUrl === 'string') {
        coverUrl = photoOrUrl;
        coverThumb = thumbUrl || photoOrUrl;
      } else if (photoOrUrl && typeof photoOrUrl === 'object') {
        coverUrl =
          photoOrUrl.src?.large2x ||
          photoOrUrl.src?.large ||
          photoOrUrl.src?.original ||
          photoOrUrl.url ||
          '';
        coverThumb = photoOrUrl.src?.medium || photoOrUrl.src?.small || coverUrl;
        coverAttr = {
          photographer: photoOrUrl.photographer,
          photographer_url: photoOrUrl.photographer_url,
          url: photoOrUrl.url,
        };
      }

      if (!coverUrl) {
        throw new Error('URL da foto não encontrada');
      }

      await api.trips.update(trip.id, {
        cover_image_url: coverUrl,
        cover_image_thumb: coverThumb,
        cover_image_attribution: coverAttr,
      });
      loadAllTripData();
    } catch (err: any) {
      alert(err.message || 'Erro ao atualizar capa');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      {/* Top Hero / Banner */}
      <div className="relative min-h-[280px] sm:min-h-[320px] sm:h-80 w-full flex flex-col justify-between p-4 sm:p-6 overflow-hidden bg-slate-900 text-white">
        <div className="absolute inset-0 z-0">
          {trip.cover_image_url ? (
            <img
              src={trip.cover_image_url}
              alt={trip.title}
              className="w-full h-full object-cover opacity-75 transform hover:scale-105 transition-transform duration-700 ease-out"
            />
          ) : (
            <div
              className="w-full h-full opacity-80"
              style={{
                background: `linear-gradient(135deg, ${primaryColor} 0%, #1e1b4b 100%)`,
              }}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/50 to-slate-950/20" />
        </div>

        {/* Back and Action Toolbar */}
        <div className="relative z-10 w-full max-w-7xl mx-auto flex items-center justify-between gap-2">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/40 hover:bg-black/60 text-white text-xs font-semibold backdrop-blur transition-colors shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Minhas Viagens</span>
            <span className="sm:hidden">Viagens</span>
          </button>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 flex-wrap justify-end">
            <button
              onClick={handleCopyTabLink}
              className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-full bg-black/40 hover:bg-black/60 text-white text-xs font-semibold backdrop-blur transition-colors"
              title="Copiar link direto para esta aba"
            >
              {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Share2 className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{copiedLink ? 'Link Copiado!' : 'Copiar Link'}</span>
              <span className="sm:hidden">{copiedLink ? 'Copiado' : 'Link'}</span>
            </button>

            {canManage && (
              <button
                onClick={() => setShowMembersModal(true)}
                className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-full bg-black/40 hover:bg-black/60 text-white text-xs font-semibold backdrop-blur transition-colors"
              >
                <Users className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Viajantes ({members.length})</span>
                <span className="sm:hidden">({members.length})</span>
              </button>
            )}

            {canEdit && (
              <>
                <button
                  onClick={() => setShowPexelsModal(true)}
                  className="flex items-center gap-1 p-1.5 sm:px-3 sm:py-1.5 rounded-full bg-black/40 hover:bg-black/60 text-white text-xs font-semibold backdrop-blur transition-colors"
                  title="Alterar imagem de capa via Pexels"
                >
                  <Image className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Capa</span>
                </button>

                <button
                  onClick={() => setShowThemePicker(true)}
                  className="flex items-center gap-1 p-1.5 sm:px-3 sm:py-1.5 rounded-full bg-black/40 hover:bg-black/60 text-white text-xs font-semibold backdrop-blur transition-colors"
                  title="Personalizar tema visual da viagem"
                >
                  <Palette className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Tema</span>
                </button>
              </>
            )}

            {canManage && (
              <button
                onClick={() => setShowDeleteModal(true)}
                className="flex items-center gap-1 p-1.5 sm:px-3 sm:py-1.5 rounded-full bg-rose-500/25 hover:bg-rose-600 text-rose-200 hover:text-white text-xs font-semibold backdrop-blur transition-all border border-rose-500/30"
                title="Excluir ou arquivar esta viagem"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Excluir</span>
              </button>
            )}
          </div>
        </div>

        {/* Hero Title & Context */}
        <div className="relative z-10 w-full max-w-7xl mx-auto pt-6">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span
              className="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase shadow-sm"
              style={{ backgroundColor: primaryColor }}
            >
              {trip.status}
            </span>

            {trip.primary_country && (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-white/20 backdrop-blur">
                {trip.primary_country}
              </span>
            )}

            {trip.cover_image_attribution?.photographer && (
              <span className="text-[10px] text-white/60">
                Foto: {trip.cover_image_attribution.photographer} (Pexels)
              </span>
            )}
          </div>

          <h1 className="text-3xl sm:text-5xl font-extrabold font-serif tracking-tight drop-shadow-sm">
            {trip.title}{' '}
            {trip.subtitle && (
              <span className="font-sans font-light text-2xl sm:text-3xl opacity-90">{trip.subtitle}</span>
            )}
          </h1>

          {trip.tagline && (
            <p className="text-xs sm:text-sm text-white/90 italic mt-1 font-serif">{trip.tagline}</p>
          )}

          <div className="flex items-center gap-4 mt-3 text-xs text-white/80 font-medium flex-wrap">
            <span className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-brand-300" />
              {dateRangeDisplay}
            </span>
            <span className="flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-brand-300" />
              {trip.destination_summary || 'Vários destinos'}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-brand-300" />
              {days.length} dias programados
            </span>
          </div>
        </div>
      </div>

      {/* Main Tab Navigation */}
      <div className="sticky top-16 z-30 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-1 sm:space-x-3 overflow-x-auto py-2.5">
            {[
              { id: 'overview', label: 'Visão Geral', icon: Sparkles },
              { id: 'timeline', label: 'Timeline', icon: Route },
              { id: 'itinerary', label: 'Roteiro', icon: Calendar, count: days.length },
              { id: 'transports', label: 'Voos & Transportes', icon: Plane, count: transports.length },
              { id: 'hotels', label: 'Hospedagens', icon: Building, count: hotels.length },
              { id: 'documents', label: 'Documentos & IA', icon: FileText, count: documents.length },
              { id: 'expenses', label: 'Despesas & Acertos', icon: DollarSign },
              { id: 'report', label: 'Trip Book', icon: BookOpen },
            ].map((tItem) => {
              const Icon = tItem.icon;
              const isActive = activeTab === tItem.id;
              return (
                <button
                  key={tItem.id}
                  onClick={() => handleTabChange(tItem.id as TabType)}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                    isActive ? 'text-white shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                  style={isActive ? { backgroundColor: primaryColor } : undefined}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tItem.label}</span>
                  {tItem.count !== undefined && (
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                        isActive ? 'bg-white/25 text-white' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {tItem.count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Main Tab Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Quick Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Description & Objectives */}
              <div className="md:col-span-2 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                <h3 className="text-base font-bold font-serif text-slate-900 mb-3">Sobre esta Viagem</h3>
                <p className="text-xs sm:text-sm text-slate-700 leading-relaxed font-sans">
                  {trip.description ||
                    'Nenhuma descrição detalhada informada. Você pode cadastrar objetivos, contexto e destaques da viagem.'}
                </p>

                {/* Cities Pill Tags */}
                {Array.isArray(trip.cities) && trip.cities.length > 0 && (
                  <div className="mt-5 pt-4 border-t border-slate-100">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">
                      Cidades & Pontos de Parada
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {trip.cities.map((city, idx) => (
                        <span
                          key={idx}
                          className="px-2.5 py-1 bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg"
                        >
                          {city}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Fast Stats & Quick Actions */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between">
                <div>
                  <h3 className="text-base font-bold font-serif text-slate-900 mb-4">Resumo da Viagem</h3>
                  <div className="space-y-3 text-xs">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <span className="text-slate-500">Dias de Itinerário</span>
                      <strong className="text-slate-800">{days.length} dias</strong>
                    </div>
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <span className="text-slate-500">Voos & Trechos</span>
                      <strong className="text-slate-800">{transports.length} reservas</strong>
                    </div>
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <span className="text-slate-500">Hospedagens</span>
                      <strong className="text-slate-800">{hotels.length} hotéis</strong>
                    </div>
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <span className="text-slate-500">Documentos e Vouchers</span>
                      <strong className="text-slate-800">{documents.length} arquivos</strong>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Moeda Base</span>
                      <strong className="text-slate-800">{trip.default_currency}</strong>
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-100">
                  <button
                    onClick={() => handleTabChange('report')}
                    className="w-full py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold shadow-sm transition-colors flex items-center justify-center gap-2"
                  >
                    <BookOpen className="w-4 h-4" />
                    Abrir Trip Book Editorial
                  </button>
                </div>
              </div>
            </div>

            {/* GROUP BALANCES & SETTLEMENT SUMMARY WIDGET */}
            {expensesData && Object.keys(expensesData.balancesByCurrency || {}).length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <Scale className="w-5 h-5 text-indigo-600" />
                    <div>
                      <h3 className="text-base font-bold font-serif text-slate-900">
                        Divisão de Despesas & Saldos do Grupo
                      </h3>
                      <p className="text-xs text-slate-500">
                        Acompanhamento de quem deve a quem calculado automaticamente por moeda
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleTabChange('expenses')}
                    className="text-xs font-bold text-brand-600 hover:text-brand-700 flex items-center gap-1"
                  >
                    <span>Ver Detalhes & Gráficos</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="space-y-4">
                  {Object.entries(expensesData.balancesByCurrency).map(([curr, balances]) => {
                    const sorted = [...balances].sort((a, b) => a.netBalance - b.netBalance);
                    const debtor = sorted[0]?.netBalance < -0.01 ? sorted[0] : null;
                    const settlements = expensesData.settlementsByCurrency[curr] || [];

                    return (
                      <div key={curr} className="p-4 bg-slate-50 border border-slate-200/80 rounded-xl space-y-3">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                            Saldos em {curr}
                          </span>
                          <span className="text-[11px] font-mono font-semibold text-slate-500">
                            Total compartilhado: {curr}{' '}
                            {(expensesData.sharedTotalsByCurrency[curr] || 0).toLocaleString('pt-BR', {
                              minimumFractionDigits: 2,
                            })}
                          </span>
                        </div>

                        {/* Suggestion alert for the largest debtor */}
                        {debtor && (
                          <div className="p-3 bg-amber-50 border border-amber-200/70 rounded-lg text-xs text-amber-900 flex items-center gap-2.5">
                            <Info className="w-4 h-4 text-amber-600 shrink-0" />
                            <span>
                              <strong>Dica de equilíbrio:</strong> {debtor.name} está com o maior saldo devedor (
                              {curr}{' '}
                              {Math.abs(debtor.netBalance).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}).
                              Pode pagar a próxima conta ou refeição coletiva para equilibrar as contas do grupo!
                            </span>
                          </div>
                        )}

                        {/* Balances pills */}
                        <div className="flex flex-wrap gap-2">
                          {balances.map((b) => (
                            <div
                              key={b.travelerId}
                              className={`px-3 py-1.5 rounded-lg text-xs border flex items-center gap-2 ${
                                b.netBalance > 0.01
                                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                                  : b.netBalance < -0.01
                                  ? 'bg-rose-50 border-rose-200 text-rose-900'
                                  : 'bg-white border-slate-200 text-slate-600'
                              }`}
                            >
                              <span className="font-semibold">{b.name}:</span>
                              <strong className="font-mono">
                                {b.netBalance > 0 ? '+' : ''}
                                {curr}{' '}
                                {b.netBalance.toLocaleString('pt-BR', {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </strong>
                              <span className="text-[10px] font-medium opacity-80">
                                {b.netBalance > 0.01 ? '(Recebe)' : b.netBalance < -0.01 ? '(Deve)' : '(Quitado)'}
                              </span>
                            </div>
                          ))}
                        </div>

                        {/* Settlements summary line */}
                        {settlements.length > 0 && (
                          <div className="pt-2 border-t border-slate-200/80 text-xs text-slate-600">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                              Pagamentos diretos sugeridos para zerar pendências:
                            </span>
                            <div className="flex flex-wrap gap-2">
                              {settlements.map((st, i) => (
                                <span
                                  key={i}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs"
                                >
                                  <strong className="text-rose-700">{st.fromName}</strong>
                                  <span className="text-slate-400 text-[11px]">paga</span>
                                  <strong className="font-mono text-slate-900">
                                    {curr} {st.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                  </strong>
                                  <span className="text-slate-400 text-[11px]">para</span>
                                  <strong className="text-emerald-700">{st.toName}</strong>
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Quick Preview of Upcoming Days */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold font-serif text-slate-900">Prévia do Roteiro</h3>
                <button
                  onClick={() => handleTabChange('itinerary')}
                  className="text-xs font-semibold text-brand-600 hover:underline"
                >
                  Ver Todos os Dias ({days.length}) →
                </button>
              </div>

              {days.length === 0 ? (
                <p className="text-xs text-slate-400 italic">Nenhum dia cadastrado ainda.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {days.slice(0, 4).map((d) => (
                    <div key={d.id} className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 text-xs">
                      <div className="flex items-center justify-between font-bold text-slate-900 mb-1">
                        <span>
                          {d.icon || '📍'} Dia {d.day_number}
                        </span>
                        <span className="text-[10px] text-slate-400">{d.date}</span>
                      </div>
                      <p className="font-semibold text-slate-800 truncate">{d.title || d.base_location}</p>
                      <p className="text-[11px] text-slate-500 truncate mt-0.5">
                        {d.subtitle || 'Atividades livres'}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Danger Zone / Trip Management */}
            {canManage && (
              <div className="bg-white rounded-2xl border border-rose-200/80 p-6 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-base font-bold font-serif text-slate-900 flex items-center gap-2">
                      <Trash2 className="w-4 h-4 text-rose-600" />
                      <span>Zona de Gerenciamento & Exclusão</span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-1 max-w-xl">
                      Como proprietário ou administrador desta viagem, você pode arquivá-la ou excluí-la. Todos os participantes perderão o acesso aos itinerários, reservas e documentos associados.
                    </p>
                  </div>
                  <button
                    onClick={() => setShowDeleteModal(true)}
                    className="px-4 py-2 bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white border border-rose-200 hover:border-transparent rounded-xl text-xs font-bold transition-all shrink-0 flex items-center justify-center gap-2"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Excluir Viagem</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'timeline' && (
          <MacroTimelineView
            trip={trip}
            days={days}
            transports={transports}
            hotels={hotels}
            onRefresh={loadAllTripData}
            canEdit={canEdit}
            onNavigateTab={(tabName) => handleTabChange(tabName as TabType)}
          />
        )}

        {activeTab === 'itinerary' && (
          <TimelineView
            trip={trip}
            days={days}
            transports={transports}
            hotels={hotels}
            onRefresh={loadAllTripData}
            canEdit={canEdit}
          />
        )}

        {activeTab === 'transports' && (
          <TransportsView tripId={trip.id} transports={transports} onRefresh={loadAllTripData} canEdit={canEdit} />
        )}

        {activeTab === 'hotels' && (
          <HotelsView
            tripId={trip.id}
            hotels={hotels}
            travelers={travelers}
            onRefresh={loadAllTripData}
            canEdit={canEdit}
          />
        )}

        {activeTab === 'documents' && (
          <DocumentsView
            tripId={trip.id}
            documents={documents}
            travelers={travelers}
            onRefresh={loadAllTripData}
            canEdit={canEdit}
          />
        )}

        {activeTab === 'expenses' && (
          <ExpensesView tripId={trip.id} canEdit={canEdit} currentUserId={user?.id} />
        )}

        {activeTab === 'report' && <ReportEditorView trip={trip} canEdit={canEdit} />}
      </main>

      {/* Modals */}
      {showThemePicker && (
        <ThemePicker
          currentTheme={trip.theme}
          onSave={handleUpdateTheme}
          onClose={() => setShowThemePicker(false)}
        />
      )}

      {showPexelsModal && (
        <PexelsModal
          tripId={trip.id}
          onSelect={handleSelectCover}
          onClose={() => setShowPexelsModal(false)}
        />
      )}

      {showMembersModal && (
        <MembersModal
          tripId={trip.id}
          members={members}
          onRefresh={loadAllTripData}
          onClose={() => setShowMembersModal(false)}
          canManage={canManage}
        />
      )}

      {showDeleteModal && (
        <DeleteTripModal
          trip={trip}
          isOpen={showDeleteModal}
          onClose={() => setShowDeleteModal(false)}
          onSuccess={() => {
            setShowDeleteModal(false);
            navigate('/');
          }}
        />
      )}
    </div>
  );
};

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Calendar,
  Clock,
  MapPin,
  MapPinOff,
  Sparkles,
  Plus,
  AlertTriangle,
  Lightbulb,
  CheckCircle,
  Loader2,
  Trash2,
  Edit2,
  Tag,
  GripVertical,
  ChevronUp,
  ChevronDown,
  ArrowLeft,
  Check,
  X,
  FileText,
  Wand2,
  ExternalLink,
} from 'lucide-react';
import { Trip, TripDay, ItineraryItem } from '../types/index.js';
import { api } from '../api/client.js';
import { parseSafeDate } from '../utils/date.js';
import { ItineraryMap, type ItineraryMapPoint } from './ItineraryMap.js';
import { GoogleMapsIcon } from './GoogleMapsIcon.js';
import { DayMiniMap } from './DayMiniMap.js';

interface TimelineViewProps {
  trip: Trip;
  days: TripDay[];
  onRefresh: () => void;
  canEdit: boolean;
}

const SAMPLE_ITINERARY_TEXT = `18/03 chegada em tokyo - Transfer In
19 Templo Sensoji, Ginza, Tsukiji, Tokyo Sky tree e Teamlab Borderless
20 Santuário Meiji, Harajuku, Shinjuku/kabukicho e Shibuya
21 Monte Fuji

22 Ida para Kyoto e Cerimônia do chá
23 Kiyomizu-dera, Ninenzaka Street, Gion e Sannenzaka Street
24 Fushimi Inari e Nishiki Mercado
25 Arashiyama, Floresta de kimono, Kinkakuji e Noite no Ryokan

26 : Ida pra Osaka, Dotonbori e Nanba templo
27 Osaka castle e Museu Cup noodles
28 Universal Japão
29 Nara Park, Todaiji templo e Kasuga templo das 3000 lanternas

30 Dia livre em Tokyo (sugestão de visitar bairro Akihabara)
31 Retorno ao Brasil - Transfer Out`;

const toFiniteCoordinate = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;

  const coordinate = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(coordinate) ? coordinate : null;
};

const hasMapCoordinates = (item: Pick<ItineraryItem, 'latitude' | 'longitude'>) => {
  const latitude = toFiniteCoordinate(item.latitude);
  const longitude = toFiniteCoordinate(item.longitude);

  return (
    latitude !== null && latitude >= -90 && latitude <= 90 &&
    longitude !== null && longitude >= -180 && longitude <= 180 &&
    !(latitude === 0 && longitude === 0)
  );
};

export const TimelineView: React.FC<TimelineViewProps> = ({ trip, days, onRefresh, canEdit }) => {
  const [localDays, setLocalDays] = useState<TripDay[]>(days);
  const [generatingDayId, setGeneratingDayId] = useState<string | null>(null);
  const [refreshingLocations, setRefreshingLocations] = useState(false);
  const [locationRefreshMessage, setLocationRefreshMessage] = useState<string | null>(null);
  const [locationRefreshError, setLocationRefreshError] = useState<string | null>(null);
  const [highlightedItemId, setHighlightedItemId] = useState<string | null>(null);

  // Synchronize localDays when prop days changes
  useEffect(() => {
    setLocalDays(days);
  }, [days]);

  // Modals state
  const [showAddDayModal, setShowAddDayModal] = useState(false);
  const [showAddItemModal, setShowAddItemModal] = useState<string | null>(null); // dayId
  const [editingDay, setEditingDay] = useState<TripDay | null>(null);
  const [editingItem, setEditingItem] = useState<{ dayId: string; item: ItineraryItem } | null>(null);

  // AI Assistant Modal state
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiText, setAiText] = useState('');
  const [aiReplaceExisting, setAiReplaceExisting] = useState(days.length === 0);
  const [isAiAnalyzing, setIsAiAnalyzing] = useState(false);
  const [isAiApplying, setIsAiApplying] = useState(false);
  const [aiPreviewDays, setAiPreviewDays] = useState<any[] | null>(null);

  // Drag and Drop states
  const [draggedItem, setDraggedItem] = useState<{ dayId: string; itemId: string; index: number } | null>(null);
  const [dragOverDayId, setDragOverDayId] = useState<string | null>(null);
  const [dragOverItemId, setDragOverItemId] = useState<string | null>(null);
  const [draggedDayIndex, setDraggedDayIndex] = useState<number | null>(null);

  // New day form
  const [newDayDate, setNewDayDate] = useState('');
  const [newDayNumber, setNewDayNumber] = useState(days.length + 1);
  const [newDayTitle, setNewDayTitle] = useState('');
  const [newDaySubtitle, setNewDaySubtitle] = useState('');
  const [newDayBase, setNewDayBase] = useState('');
  const [newDayIcon, setNewDayIcon] = useState('📍');

  // New item form
  const [itemTitle, setItemTitle] = useState('');
  const [itemCategory, setItemCategory] = useState('ATTRACTION');
  const [itemTime, setItemTime] = useState('');
  const [itemAddress, setItemAddress] = useState('');
  const [itemTips, setItemTips] = useState('');

  const primaryColor = trip.theme?.primary || '#b94a5d';

  const mapPoints = useMemo<ItineraryMapPoint[]>(() => {
    let number = 0;
    return localDays.flatMap((day) =>
      (day.items || []).flatMap((item) => {
        if (item.map_mode === 'SKIP') return [];
        const latitude = toFiniteCoordinate(item.latitude);
        const longitude = toFiniteCoordinate(item.longitude);
        if (
          latitude === null || latitude < -90 || latitude > 90 ||
          longitude === null || longitude < -180 || longitude > 180 ||
          (latitude === 0 && longitude === 0)
        ) {
          return [];
        }

        number += 1;
        return [{
          itemId: item.id,
          number,
          title: item.title,
          dayLabel: day.title || `Dia ${day.day_number}`,
          latitude,
          longitude,
        }];
      })
    );
  }, [localDays]);

  const mapPointNumbers = useMemo(
    () => new Map(mapPoints.map((point) => [point.itemId, point.number])),
    [mapPoints]
  );

  const handleMapPointSelect = useCallback((itemId: string) => {
    setHighlightedItemId(itemId);
    requestAnimationFrame(() => {
      const itemElement = document.getElementById(`itinerary-item-${itemId}`);
      itemElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      itemElement?.focus({ preventScroll: true });
    });
    window.setTimeout(() => setHighlightedItemId((current) => (current === itemId ? null : current)), 2200);
  }, []);

  const handleRefreshLocations = async () => {
    const daysToRefresh = localDays.filter((day) =>
      (day.items || []).some(
        (item) =>
          item.category !== 'NOTE' &&
          item.map_mode !== 'SKIP' &&
          !item.location_confirmed_at &&
          (!hasMapCoordinates(item) || item.location_source === 'OPENAI_WEB_SEARCH')
      )
    );

    if (daysToRefresh.length === 0) {
      setLocationRefreshError(null);
      setLocationRefreshMessage('Todos os pontos localizados já foram confirmados ou informados manualmente.');
      return;
    }

    setRefreshingLocations(true);
    setLocationRefreshError(null);
    let updated = 0;
    let resolved = 0;
    const failedDays: string[] = [];

    try {
      for (let index = 0; index < daysToRefresh.length; index += 1) {
        const day = daysToRefresh[index];
        const label = day.title || `Dia ${day.day_number}`;
        setLocationRefreshMessage(`Localizando ${label} (${index + 1}/${daysToRefresh.length})…`);

        try {
          const { locationRefresh } = await api.days.refreshLocations(trip.id, day.id);
          updated += locationRefresh.updated;
          resolved += locationRefresh.resolved;
          if (locationRefresh.error) failedDays.push(label);
        } catch (err: any) {
          failedDays.push(label);
          console.error('Erro ao localizar pontos do dia:', { dayId: day.id, error: err?.message });
        }
      }

      onRefresh();

      if (failedDays.length > 0) {
        setLocationRefreshError(
          `Não foi possível concluir ${failedDays.length} dia(s): ${failedDays.join(', ')}. ` +
          'Os demais dias foram atualizados; tente novamente apenas para os pendentes.'
        );
      }
      setLocationRefreshMessage(
        `${updated} ponto${updated === 1 ? '' : 's'} atualizado${updated === 1 ? '' : 's'} ` +
        `em ${daysToRefresh.length - failedDays.length}/${daysToRefresh.length} dia(s). ` +
        `${resolved} localização(ões) verificadas.`
      );
    } finally {
      setRefreshingLocations(false);
    }
  };

  const handleLocationConfirmation = async (item: ItineraryItem) => {
    const confirmed = !item.location_confirmed_at;
    try {
      await api.days.setLocationConfirmation(trip.id, item.id, confirmed);
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Não foi possível alterar a confirmação deste ponto.');
    }
  };

  const handleMapMode = async (item: ItineraryItem) => {
    const mapMode = item.map_mode === 'SKIP' ? 'AUTO' : 'SKIP';
    try {
      await api.days.setMapMode(trip.id, item.id, mapMode);
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Não foi possível alterar a visibilidade deste item no mapa.');
    }
  };

  // Format short date
  const formatDateShort = (dStr: string) => {
    const d = parseSafeDate(dStr);
    if (!d) return dStr;
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  };

  // Generate narrative with AI
  const handleGenerateNarrative = async (dayId: string) => {
    setGeneratingDayId(dayId);
    try {
      await api.ai.generateDayNarrative(trip.id, dayId);
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Erro ao gerar narrativa com IA');
    } finally {
      setGeneratingDayId(null);
    }
  };

  // Create Day
  const handleCreateDay = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.days.create(trip.id, {
        date: newDayDate,
        day_number: newDayNumber,
        title: newDayTitle,
        subtitle: newDaySubtitle,
        base_location: newDayBase,
        icon: newDayIcon,
      });
      setShowAddDayModal(false);
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Erro ao criar dia');
    }
  };

  // Update Day
  const handleUpdateDay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDay) return;
    try {
      await api.days.update(trip.id, editingDay.id, {
        title: editingDay.title,
        subtitle: editingDay.subtitle,
        date: editingDay.date,
        day_number: editingDay.day_number,
        base_location: editingDay.base_location,
        icon: editingDay.icon,
        temperature_min: editingDay.temperature_min,
        temperature_max: editingDay.temperature_max,
        estimated_cost: editingDay.estimated_cost,
        cost_currency: editingDay.cost_currency,
        included_services: editingDay.included_services,
        narrative: editingDay.narrative,
      });
      setEditingDay(null);
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Erro ao atualizar dia');
    }
  };

  // Delete Day
  const handleDeleteDay = async (dayId: string) => {
    if (!window.confirm('Tem certeza que deseja remover este dia do roteiro?')) return;
    try {
      await api.days.delete(trip.id, dayId);
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Erro ao remover dia');
    }
  };

  // Move Day up/down
  const handleMoveDay = async (dayIndex: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? dayIndex - 1 : dayIndex + 1;
    if (targetIndex < 0 || targetIndex >= localDays.length) return;

    const newDays = [...localDays];
    const [moved] = newDays.splice(dayIndex, 1);
    newDays.splice(targetIndex, 0, moved);

    const updated = newDays.map((d, i) => ({ ...d, day_number: i + 1 }));
    setLocalDays(updated);

    try {
      await api.days.reorder(trip.id, updated.map((d) => d.id));
    } catch (err: any) {
      console.error('Erro ao reordenar dias:', err);
      onRefresh();
    }
  };

  // Create Item
  const handleCreateItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showAddItemModal) return;
    try {
      await api.days.createItem(trip.id, showAddItemModal, {
        title: itemTitle,
        category: itemCategory,
        start_time: itemTime || null,
        address: itemAddress || null,
        tips: itemTips || null,
      });
      setShowAddItemModal(null);
      setItemTitle('');
      setItemTime('');
      setItemAddress('');
      setItemTips('');
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Erro ao criar atividade');
    }
  };

  // Update Item
  const handleUpdateItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;
    try {
      await api.days.updateItem(trip.id, editingItem.dayId, editingItem.item.id, {
        title: editingItem.item.title,
        category: editingItem.item.category,
        start_time: editingItem.item.start_time || null,
        end_time: editingItem.item.end_time || null,
        address: editingItem.item.address || null,
        tips: editingItem.item.tips || null,
        notes: editingItem.item.notes || null,
      });
      setEditingItem(null);
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Erro ao atualizar atividade');
    }
  };

  // Delete Item
  const handleDeleteItem = async (dayId: string, itemId: string) => {
    if (!window.confirm('Deseja remover esta atividade?')) return;
    try {
      await api.days.deleteItem(trip.id, dayId, itemId);
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Erro ao remover item');
    }
  };

  // --- DRAG & DROP LOGIC ---

  // Reorder items in same day
  const handleReorderItemsInDay = async (dayId: string, itemId: string, targetIndex: number) => {
    const day = localDays.find((d) => d.id === dayId);
    if (!day || !day.items) return;

    const currentItems = [...day.items];
    const oldIndex = currentItems.findIndex((it) => it.id === itemId);
    if (oldIndex === -1) return;

    const [moved] = currentItems.splice(oldIndex, 1);
    currentItems.splice(targetIndex, 0, moved);

    setLocalDays((prev) =>
      prev.map((d) => (d.id === dayId ? { ...d, items: currentItems } : d))
    );

    try {
      await api.days.reorderItems(trip.id, dayId, currentItems.map((it) => it.id));
    } catch (err) {
      console.error('Erro ao salvar nova ordem:', err);
      onRefresh();
    }
  };

  // Move item across days
  const handleMoveItemToDay = async (
    itemId: string,
    sourceDayId: string,
    targetDayId: string,
    targetIndex?: number
  ) => {
    const sourceDay = localDays.find((d) => d.id === sourceDayId);
    const targetDay = localDays.find((d) => d.id === targetDayId);
    if (!sourceDay || !targetDay) return;

    const sourceItems = [...(sourceDay.items || [])];
    const targetItems = [...(targetDay.items || [])];

    const itemIndex = sourceItems.findIndex((it) => it.id === itemId);
    if (itemIndex === -1) return;

    const [moved] = sourceItems.splice(itemIndex, 1);
    const insertIdx = typeof targetIndex === 'number' ? targetIndex : targetItems.length;
    targetItems.splice(insertIdx, 0, { ...moved, trip_day_id: targetDayId });

    setLocalDays((prev) =>
      prev.map((d) => {
        if (d.id === sourceDayId) return { ...d, items: sourceItems };
        if (d.id === targetDayId) return { ...d, items: targetItems };
        return d;
      })
    );

    try {
      await api.days.moveItem(trip.id, itemId, {
        targetDayId,
        newOrderIndex: insertIdx,
      });
      await api.days.reorderItems(trip.id, targetDayId, targetItems.map((it) => it.id));
      onRefresh();
    } catch (err) {
      console.error('Erro ao salvar item no novo dia:', err);
      onRefresh();
    }
  };

  // --- AI ITINERARY ASSISTANT LOGIC ---

  const handleAiAnalyze = async () => {
    if (!aiText.trim()) {
      alert('Por favor, informe o texto do roteiro.');
      return;
    }

    setIsAiAnalyzing(true);
    try {
      const res = await api.ai.parseItinerary(trip.id, {
        text: aiText,
        replaceExisting: aiReplaceExisting,
        apply: false, // preview first
      });
      setAiPreviewDays(res.days);
    } catch (err: any) {
      alert(err.message || 'Erro ao analisar roteiro com IA');
    } finally {
      setIsAiAnalyzing(false);
    }
  };

  const handleAiApply = async () => {
    setIsAiApplying(true);
    try {
      await api.ai.parseItinerary(trip.id, {
        text: aiText,
        replaceExisting: aiReplaceExisting,
        apply: true, // commit to DB
      });
      setShowAiModal(false);
      setAiPreviewDays(null);
      setAiText('');
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Erro ao aplicar roteiro no banco de dados');
    } finally {
      setIsAiApplying(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold font-serif text-slate-900">Roteiro Cronológico por Dia</h2>
          <p className="text-xs text-slate-500">
            {localDays.length} dias programados • Arraste para reordenar atrações ou movê-las entre dias
          </p>
        </div>

        {canEdit && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setShowAiModal(true);
                setAiPreviewDays(null);
              }}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-all hover:shadow"
            >
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>Gerar Roteiro com IA</span>
            </button>

            <button
              onClick={() => setShowAddDayModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Adicionar Dia</span>
            </button>
          </div>
        )}
      </div>

      <ItineraryMap
        points={mapPoints}
        onPointSelect={handleMapPointSelect}
        onRefresh={handleRefreshLocations}
        isRefreshing={refreshingLocations}
        canRefresh={canEdit}
        accentColor={primaryColor}
        refreshMessage={locationRefreshMessage}
        refreshError={locationRefreshError}
      />

      {/* Days List */}
      {localDays.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200">
          <Calendar className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-800">Nenhum dia cadastrado no roteiro</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-5">
            Você pode colar anotações de viagem (dias, datas, atrações) para a IA estruturar automaticamente, ou cadastrar manualmente.
          </p>
          {canEdit && (
            <div className="flex justify-center gap-3">
              <button
                onClick={() => {
                  setShowAiModal(true);
                  setAiPreviewDays(null);
                }}
                className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl text-xs font-semibold shadow"
              >
                <Sparkles className="w-4 h-4 text-amber-300" />
                Criar Roteiro com IA
              </button>
              <button
                onClick={() => setShowAddDayModal(true)}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold"
              >
                Criar Manualmente
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {localDays.map((day, dayIndex) => {
            const isDayDragTarget = dragOverDayId === day.id;
            const dayItemIds = new Set((day.items || []).map((i) => i.id));
            const dayPoints = mapPoints
              .filter((p) => dayItemIds.has(p.itemId))
              .map((p) => ({
                itemId: p.itemId,
                number: p.number,
                title: p.title,
                latitude: p.latitude,
                longitude: p.longitude,
              }));

            return (
              <div
                key={day.id}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (draggedItem && draggedItem.dayId !== day.id) {
                    setDragOverDayId(day.id);
                  }
                }}
                onDragLeave={() => {
                  if (dragOverDayId === day.id && !dragOverItemId) {
                    setDragOverDayId(null);
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (draggedItem && draggedItem.dayId !== day.id) {
                    handleMoveItemToDay(draggedItem.itemId, draggedItem.dayId, day.id);
                  }
                  setDraggedItem(null);
                  setDragOverDayId(null);
                  setDragOverItemId(null);
                }}
                className={`bg-white rounded-2xl border transition-all p-3.5 sm:p-6 shadow-sm hover:shadow-md relative overflow-hidden ${
                  isDayDragTarget
                    ? 'border-indigo-500 ring-2 ring-indigo-200 bg-indigo-50/20'
                    : 'border-slate-200'
                }`}
              >
                {/* Day Header */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 sm:gap-4 pb-3.5 sm:pb-4 border-b border-slate-100">
                  <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                    {/* Day number badge + up/down arrows */}
                    <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                      {canEdit && (
                        <div className="flex flex-col gap-0.5 text-slate-300">
                          <button
                            type="button"
                            disabled={dayIndex === 0}
                            onClick={() => handleMoveDay(dayIndex, 'up')}
                            className="p-0.5 hover:text-slate-700 disabled:opacity-20 disabled:hover:text-slate-300 transition-colors"
                            title="Mover dia para cima"
                          >
                            <ChevronUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={dayIndex === localDays.length - 1}
                            onClick={() => handleMoveDay(dayIndex, 'down')}
                            className="p-0.5 hover:text-slate-700 disabled:opacity-20 disabled:hover:text-slate-300 transition-colors"
                            title="Mover dia para baixo"
                          >
                            <ChevronDown className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}

                      <div
                        className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl text-white font-bold flex flex-col items-center justify-center text-xs shrink-0 shadow-sm"
                        style={{ backgroundColor: primaryColor }}
                      >
                        <span className="text-[9px] sm:text-[10px] uppercase font-light opacity-90">Dia</span>
                        <span className="text-xs sm:text-sm font-extrabold leading-tight">{day.day_number}</span>
                      </div>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                        <span className="text-base sm:text-lg shrink-0">{day.icon || '📍'}</span>
                        <h3 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight break-words">
                          {day.title || `Dia ${day.day_number}`}
                        </h3>
                        <span className="text-[11px] sm:text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full shrink-0">
                          {formatDateShort(day.date)}
                        </span>
                      </div>
                      {day.subtitle && <p className="text-xs text-slate-500 mt-0.5 break-words">{day.subtitle}</p>}
                    </div>
                  </div>

                  {canEdit && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleGenerateNarrative(day.id)}
                        disabled={generatingDayId === day.id}
                        className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg transition-colors border border-amber-200/60"
                        title="Gerar narrativa editorial com IA"
                      >
                        {generatingDayId === day.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="w-3.5 h-3.5" />
                        )}
                        <span className="hidden sm:inline">IA Narrativa</span>
                      </button>

                      <button
                        onClick={() => setEditingDay(day)}
                        className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
                        title="Editar detalhes do dia"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => handleDeleteDay(day.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50"
                        title="Excluir dia"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Day Narrative */}
                {day.narrative ? (
                  <div className="my-4 p-4 rounded-xl bg-slate-50/80 border border-slate-100 text-xs text-slate-700 leading-relaxed font-sans">
                    {day.narrative}
                  </div>
                ) : (
                  canEdit && (
                    <div className="my-3 text-xs text-slate-400 italic flex items-center justify-between">
                      <span>Nenhuma narrativa editorial cadastrada para este dia.</span>
                      <button
                        onClick={() => handleGenerateNarrative(day.id)}
                        className="text-brand-600 hover:underline font-medium text-xs flex items-center gap-1"
                      >
                        <Sparkles className="w-3 h-3" /> Gerar texto com IA
                      </button>
                    </div>
                  )
                )}

                {/* Meta tags strip */}
                <div className="flex flex-wrap items-center gap-2 sm:gap-3 py-2 text-xs text-slate-600">
                  <span className="flex items-center gap-1 bg-slate-100 px-2.5 py-1 rounded-lg">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                    Base: <strong>{day.base_location || 'Em Trânsito'}</strong>
                  </span>
                  {(day.temperature_min || day.temperature_max) && (
                    <span className="flex items-center gap-1 bg-slate-100 px-2.5 py-1 rounded-lg">
                      🌡 Clima: <strong>{day.temperature_min || ''}–{day.temperature_max || ''} °C</strong>
                    </span>
                  )}
                  {day.estimated_cost && (
                    <span className="flex items-center gap-1 bg-slate-100 px-2.5 py-1 rounded-lg">
                      💴 Custo: <strong>{day.cost_currency || ''} {day.estimated_cost}</strong>
                    </span>
                  )}
                  {day.included_services && (
                    <span className="flex items-center gap-1 bg-emerald-50 text-emerald-800 border border-emerald-200/60 px-2.5 py-1 rounded-lg">
                      ✓ Incluído: <strong>{day.included_services}</strong>
                    </span>
                  )}
                </div>
                {/* Day Mini Map */}
                <DayMiniMap
                  dayNumber={day.day_number}
                  dayTitle={day.title || `Dia ${day.day_number}`}
                  points={dayPoints}
                  accentColor={primaryColor}
                  onSelectPoint={handleMapPointSelect}
                  onExpandToMainMap={() => {
                    const el = document.getElementById('itinerary-map-card');
                    if (el) {
                      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                  }}
                />

                {/* Itinerary items / activities */}
                <div className="mt-4 pt-4 border-t border-slate-100">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Atividades & Pontos Turísticos ({day.items?.length || 0})
                    </h4>
                    {canEdit && (
                      <button
                        onClick={() => setShowAddItemModal(day.id)}
                        className="text-xs font-semibold text-brand-600 hover:text-brand-700 flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" /> Adicionar Atividade
                      </button>
                    )}
                  </div>

                  {day.items && day.items.length > 0 ? (
                    <div className="space-y-2">
                      {day.items.map((item, itemIdx) => {
                        const isBeingDragged = draggedItem?.itemId === item.id;
                        const isDragOver = dragOverItemId === item.id;
                        const mapPointNumber = mapPointNumbers.get(item.id);

                        return (
                          <div
                            key={item.id}
                            id={`itinerary-item-${item.id}`}
                            tabIndex={-1}
                            draggable={canEdit}
                            onDragStart={(e) => {
                              if (!canEdit) return;
                              e.dataTransfer.setData('text/plain', item.id);
                              e.dataTransfer.effectAllowed = 'move';
                              setDraggedItem({ dayId: day.id, itemId: item.id, index: itemIdx });
                            }}
                            onDragEnd={() => {
                              setDraggedItem(null);
                              setDragOverDayId(null);
                              setDragOverItemId(null);
                            }}
                            onDragOver={(e) => {
                              if (!canEdit || !draggedItem) return;
                              e.preventDefault();
                              e.stopPropagation();
                              setDragOverDayId(day.id);
                              setDragOverItemId(item.id);
                            }}
                            onDrop={(e) => {
                              if (!canEdit || !draggedItem) return;
                              e.preventDefault();
                              e.stopPropagation();

                              if (draggedItem.itemId === item.id) {
                                setDraggedItem(null);
                                setDragOverItemId(null);
                                return;
                              }

                              if (draggedItem.dayId === day.id) {
                                handleReorderItemsInDay(day.id, draggedItem.itemId, itemIdx);
                              } else {
                                handleMoveItemToDay(draggedItem.itemId, draggedItem.dayId, day.id, itemIdx);
                              }

                              setDraggedItem(null);
                              setDragOverDayId(null);
                              setDragOverItemId(null);
                            }}
                            className={`group flex flex-col sm:flex-row sm:items-start justify-between gap-2 sm:gap-3 p-2.5 sm:p-3 rounded-xl transition-all ${
                              isBeingDragged
                                ? 'opacity-40 bg-slate-100 border border-dashed border-slate-400'
                              : isDragOver
                                ? 'bg-indigo-50 border-2 border-indigo-400 scale-[1.01]'
                                : highlightedItemId === item.id
                                ? 'bg-brand-50 border-2 border-brand-400 ring-4 ring-brand-100'
                                : 'bg-slate-50 hover:bg-slate-100/90 border border-slate-100'
                            }`}
                          >
                            <div className="flex items-start gap-2 sm:gap-2.5 min-w-0 flex-1 w-full">
                              {canEdit && (
                                <div
                                  className="mt-0.5 text-slate-300 group-hover:text-slate-500 cursor-grab active:cursor-grabbing p-0.5 rounded shrink-0"
                                  title="Arraste para reordenar ou mover de dia"
                                >
                                  <GripVertical className="w-4 h-4" />
                                </div>
                              )}

                              {/* Desktop separate column for time */}
                              {item.start_time && (
                                <div className="hidden sm:block px-2 py-0.5 bg-white border border-slate-200 rounded text-xs font-bold text-slate-700 font-mono shrink-0">
                                  {item.start_time}
                                </div>
                              )}

                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                                  {/* Mobile inline time badge - frees up column space */}
                                  {item.start_time && (
                                    <span className="sm:hidden inline-flex items-center px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[11px] font-bold text-slate-700 font-mono shrink-0">
                                      {item.start_time}
                                    </span>
                                  )}

                                  {mapPointNumber && (
                                    <span
                                      className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-[10px] font-extrabold text-white shrink-0"
                                      title={`Ponto ${mapPointNumber} no mapa`}
                                    >
                                      {mapPointNumber}
                                    </span>
                                  )}
                                  {hasMapCoordinates(item) && (
                                    <a
                                      href={`https://www.google.com/maps/search/?api=1&query=${toFiniteCoordinate(item.latitude)},${toFiniteCoordinate(item.longitude)}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      className="inline-flex items-center justify-center p-0.5 rounded hover:bg-slate-200/80 transition-transform hover:scale-115 shrink-0 cursor-pointer"
                                      title={`Abrir "${item.title}" no Google Maps`}
                                      aria-label={`Abrir "${item.title}" no Google Maps`}
                                    >
                                      <GoogleMapsIcon className="w-3.5 h-3.5" />
                                    </a>
                                  )}
                                  <span className="font-semibold text-xs text-slate-900 break-words">{item.title}</span>
                                  {item.map_mode === 'SKIP' && (
                                    <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 ring-1 ring-slate-200" title="Este item não aparece no mapa e não será pesquisado automaticamente">
                                      <MapPinOff className="h-3 w-3" /> Fora do mapa
                                    </span>
                                  )}
                                  {item.location_confirmed_at && (
                                    <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200" title="Este ponto não será pesquisado novamente até a confirmação ser removida">
                                      <CheckCircle className="h-3 w-3" /> Confirmado
                                    </span>
                                  )}
                                  {item.location_kind === 'AREA' && (
                                    <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700 ring-1 ring-sky-200" title={item.location_anchor_name ? `Âncora no mapa: ${item.location_anchor_name}` : 'Área visitável'}>
                                      Área
                                    </span>
                                  )}
                                  {item.category && item.category !== 'ATTRACTION' && (
                                    <span className="text-[10px] font-medium text-slate-500 bg-white border border-slate-200 px-1.5 py-0.5 rounded">
                                      {item.category}
                                    </span>
                                  )}
                                </div>

                                {item.address && (
                                  <div className="text-[11px] text-slate-500 flex items-start gap-1 mt-1 break-words">
                                    <MapPin className="w-3 h-3 text-slate-400 shrink-0 mt-0.5" />
                                    {hasMapCoordinates(item) ? (
                                      <a
                                        href={`https://www.google.com/maps/search/?api=1&query=${toFiniteCoordinate(item.latitude)},${toFiniteCoordinate(item.longitude)}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                        className="hover:text-brand-600 hover:underline transition-colors break-words"
                                        title={`Abrir "${item.title}" no Google Maps`}
                                      >
                                        {item.address}
                                      </a>
                                    ) : (
                                      <span className="break-words">{item.address}</span>
                                    )}
                                  </div>
                                )}
                                {item.location_kind === 'AREA' && item.location_anchor_name && (
                                  <div className="text-[11px] text-sky-700 mt-0.5">
                                    Âncora: {item.location_anchor_name}
                                  </div>
                                )}
                                {item.tips && (
                                  <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200/60 rounded px-2 py-0.5 mt-1 inline-block break-words max-w-full">
                                    💡 {item.tips}
                                  </div>
                                )}
                              </div>
                            </div>

                            {canEdit && (
                              <>
                                {/* Desktop Actions: Right column with hover reveal */}
                                <div className="hidden sm:flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => handleMapMode(item)}
                                    aria-pressed={item.map_mode === 'SKIP'}
                                    className={`inline-flex items-center gap-1 rounded px-1.5 py-1 text-[10px] font-semibold transition-colors ${
                                      item.map_mode === 'SKIP'
                                        ? 'bg-slate-200 text-slate-700 hover:bg-sky-100 hover:text-sky-800'
                                        : 'bg-white text-slate-500 ring-1 ring-slate-200 hover:bg-slate-100 hover:text-slate-800'
                                    }`}
                                    title={item.map_mode === 'SKIP' ? 'Incluir no mapa e permitir pesquisa na próxima atualização' : 'Não exibir no mapa nem pesquisar automaticamente'}
                                  >
                                    <MapPinOff className="h-3.5 w-3.5" />
                                    <span>{item.map_mode === 'SKIP' ? 'Incluir no mapa' : 'Ignorar mapa'}</span>
                                  </button>
                                  {mapPointNumber && (
                                    <button
                                      type="button"
                                      onClick={() => handleLocationConfirmation(item)}
                                      aria-pressed={Boolean(item.location_confirmed_at)}
                                      className={`inline-flex items-center gap-1 rounded px-1.5 py-1 text-[10px] font-semibold transition-colors ${
                                        item.location_confirmed_at
                                          ? 'bg-emerald-100 text-emerald-800 hover:bg-amber-100 hover:text-amber-800'
                                          : 'bg-white text-slate-500 ring-1 ring-slate-200 hover:bg-emerald-50 hover:text-emerald-700'
                                      }`}
                                      title={item.location_confirmed_at ? 'Remover confirmação e permitir nova pesquisa' : 'Confirmar ponto e evitar nova pesquisa'}
                                    >
                                      <CheckCircle className="h-3.5 w-3.5" />
                                      <span>{item.location_confirmed_at ? 'Confirmado' : 'Confirmar'}</span>
                                    </button>
                                  )}
                                  <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                                    <button
                                      onClick={() => setEditingItem({ dayId: day.id, item })}
                                      className="p-1 text-slate-400 hover:text-slate-700 rounded hover:bg-slate-200"
                                      title="Editar atividade"
                                    >
                                      <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => handleDeleteItem(day.id, item.id)}
                                      className="p-1 text-slate-400 hover:text-red-600 rounded hover:bg-red-50"
                                      title="Remover atividade"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>

                                {/* Mobile Action Bar: Bottom bar giving full width to content above */}
                                <div className="sm:hidden flex items-center justify-between gap-2 pt-2 border-t border-slate-200/60 mt-0.5 w-full">
                                  <div className="flex items-center gap-1 flex-wrap">
                                    <button
                                      type="button"
                                      onClick={() => handleMapMode(item)}
                                      aria-pressed={item.map_mode === 'SKIP'}
                                      className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] font-semibold transition-colors ${
                                        item.map_mode === 'SKIP'
                                          ? 'bg-slate-200 text-slate-700'
                                          : 'bg-white text-slate-600 ring-1 ring-slate-200'
                                      }`}
                                    >
                                      <MapPinOff className="h-3 w-3" />
                                      <span>{item.map_mode === 'SKIP' ? 'No mapa' : 'Ocultar'}</span>
                                    </button>
                                    {mapPointNumber && (
                                      <button
                                        type="button"
                                        onClick={() => handleLocationConfirmation(item)}
                                        aria-pressed={Boolean(item.location_confirmed_at)}
                                        className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] font-semibold transition-colors ${
                                          item.location_confirmed_at
                                            ? 'bg-emerald-100 text-emerald-800'
                                            : 'bg-white text-slate-600 ring-1 ring-slate-200'
                                        }`}
                                      >
                                        <CheckCircle className="h-3 w-3" />
                                        <span>{item.location_confirmed_at ? 'Confirmado' : 'Confirmar'}</span>
                                      </button>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      onClick={() => setEditingItem({ dayId: day.id, item })}
                                      className="p-1.5 text-slate-600 hover:text-slate-900 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 transition-colors cursor-pointer"
                                      title="Editar atividade"
                                    >
                                      <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => handleDeleteItem(day.id, item.id)}
                                      className="p-1.5 text-red-600 hover:text-red-700 rounded-lg bg-rose-50 border border-rose-200 hover:bg-rose-100 transition-colors cursor-pointer"
                                      title="Remover atividade"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (draggedItem && draggedItem.dayId !== day.id) {
                          setDragOverDayId(day.id);
                        }
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (draggedItem) {
                          handleMoveItemToDay(draggedItem.itemId, draggedItem.dayId, day.id);
                        }
                        setDraggedItem(null);
                        setDragOverDayId(null);
                        setDragOverItemId(null);
                      }}
                      className="p-4 border-2 border-dashed border-slate-200 rounded-xl text-center text-xs text-slate-400 italic"
                    >
                      Nenhuma atração listada. Arraste uma atividade aqui ou clique em "Adicionar Atividade".
                    </div>
                  )}
                </div>

                {/* Ideas & Alerts boxes */}
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                  {day.ideas && day.ideas.length > 0 && (
                    <div className="p-3 bg-emerald-50/70 border border-emerald-200/60 rounded-xl text-xs text-emerald-900">
                      <strong className="flex items-center gap-1 mb-1 text-emerald-800">
                        <Lightbulb className="w-3.5 h-3.5 text-emerald-600" /> Sugestões & Ideias
                      </strong>
                      <p>{Array.isArray(day.ideas) ? day.ideas.join(' • ') : day.ideas}</p>
                    </div>
                  )}

                  {day.alerts && day.alerts.length > 0 && (
                    <div className="p-3 bg-amber-50/70 border border-amber-200/60 rounded-xl text-xs text-amber-900">
                      <strong className="flex items-center gap-1 mb-1 text-amber-800">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600" /> Reservar & Conferir
                      </strong>
                      <p>{Array.isArray(day.alerts) ? day.alerts.join(' • ') : day.alerts}</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL: ASSISTENTE DE ROTEIRO COM IA */}
      {showAiModal && (
        <div className="fixed inset-0 z-[100] overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-200 flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-purple-50 to-indigo-50">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-purple-600 text-white flex items-center justify-center shadow-sm">
                  <Sparkles className="w-5 h-5 text-amber-300" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Assistente de Roteiro com IA</h3>
                  <p className="text-xs text-slate-500">
                    Processado por GPT-5.6-Luna • Estruturação automática dia a dia
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowAiModal(false);
                  setAiPreviewDays(null);
                }}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              {!aiPreviewDays ? (
                <>
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-semibold text-slate-700">
                      Cole as anotações do roteiro em texto livre:
                    </label>
                    <button
                      type="button"
                      onClick={() => setAiText(SAMPLE_ITINERARY_TEXT)}
                      className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 hover:underline flex items-center gap-1"
                    >
                      <Wand2 className="w-3 h-3" /> Preencher com Exemplo
                    </button>
                  </div>

                  <textarea
                    rows={11}
                    value={aiText}
                    onChange={(e) => setAiText(e.target.value)}
                    placeholder={`Exemplo de anotação:\n18/03 chegada em tokyo - Transfer In\n19 Templo Sensoji, Ginza, Tsukiji, Tokyo Sky tree e Teamlab Borderless\n20 Santuário Meiji, Harajuku, Shinjuku/kabukicho e Shibuya\n21 Monte Fuji\n...`}
                    className="w-full px-3.5 py-2.5 text-xs font-mono border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 leading-relaxed bg-slate-50/50"
                  />

                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2 text-xs text-slate-600">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="replaceExisting"
                        checked={aiReplaceExisting}
                        onChange={(e) => setAiReplaceExisting(e.target.checked)}
                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300"
                      />
                      <label htmlFor="replaceExisting" className="font-semibold text-slate-800 cursor-pointer">
                        Substituir dias existentes deste roteiro
                      </label>
                    </div>
                    <p className="text-[11px] text-slate-500 pl-6">
                      {aiReplaceExisting
                        ? 'Os dias atuais serão substituídos pelo roteiro extraído.'
                        : 'Os novos dias identificados serão adicionados ao final dos dias já existentes.'}
                    </p>
                  </div>
                </>
              ) : (
                /* Preview State */
                <div className="space-y-3">
                  <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 px-3.5 py-2 rounded-xl text-xs text-emerald-800">
                    <span className="font-semibold flex items-center gap-1.5">
                      <Check className="w-4 h-4 text-emerald-600" />
                      {aiPreviewDays.length} dias identificados com sucesso pela IA!
                    </span>
                    <span className="text-[11px] text-emerald-700">
                      Total de {aiPreviewDays.reduce((acc, d) => acc + (d.items?.length || 0), 0)} atividades
                    </span>
                  </div>

                  <div className="max-h-96 overflow-y-auto space-y-2.5 pr-1">
                    {aiPreviewDays.map((d, idx) => (
                      <div
                        key={idx}
                        className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-base">{d.icon || '📍'}</span>
                            <strong className="text-slate-800 font-bold">
                              Dia {d.dayNumber || idx + 1}: {d.title}
                            </strong>
                          </div>
                          <span className="px-2 py-0.5 bg-white border border-slate-200 rounded text-slate-600 font-mono text-[11px]">
                            {d.date}
                          </span>
                        </div>

                        {d.baseLocation && (
                          <div className="text-[11px] text-slate-500 flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-slate-400" />
                            Base: {d.baseLocation}
                          </div>
                        )}

                        {d.items && d.items.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {d.items.map((it: any, itIdx: number) => (
                              <span
                                key={itIdx}
                                className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-slate-200 rounded-lg text-[11px] text-slate-700"
                              >
                                {it.startTime && <strong className="text-indigo-600">{it.startTime}</strong>}
                                {it.title}
                                {it.mapMode === 'SKIP' && (
                                  <span className="inline-flex items-center gap-0.5 text-slate-500" title="Não será pesquisado nem exibido no mapa">
                                    <MapPinOff className="h-3 w-3" /> Fora do mapa
                                  </span>
                                )}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50">
              {!aiPreviewDays ? (
                <>
                  <button
                    type="button"
                    onClick={() => setShowAiModal(false)}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleAiAnalyze}
                    disabled={isAiAnalyzing || !aiText.trim()}
                    className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-all disabled:opacity-50"
                  >
                    {isAiAnalyzing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-white" />
                        <span>Estruturando roteiro...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 text-amber-300" />
                        <span>Analisar e Pré-visualizar</span>
                      </>
                    )}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setAiPreviewDays(null)}
                    className="flex items-center gap-1 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Voltar e Ajustar Texto</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleAiApply}
                    disabled={isAiApplying}
                    className="flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-all disabled:opacity-50"
                  >
                    {isAiApplying ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-white" />
                        <span>Gravando roteiro...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        <span>Salvar no Roteiro</span>
                      </>
                    )}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: EDITAR DIA */}
      {editingDay && (
        <div className="fixed inset-0 z-[100] overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 p-6 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-base font-bold text-slate-900">Editar Dia do Roteiro</h3>
              <button
                type="button"
                onClick={() => setEditingDay(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateDay} className="space-y-3 overflow-y-auto flex-1 pr-1">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Data *</label>
                  <input
                    type="date"
                    required
                    value={editingDay.date}
                    onChange={(e) => setEditingDay({ ...editingDay, date: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Número do Dia</label>
                  <input
                    type="number"
                    value={editingDay.day_number}
                    onChange={(e) =>
                      setEditingDay({ ...editingDay, day_number: parseInt(e.target.value, 10) })
                    }
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Título do Dia</label>
                <input
                  type="text"
                  value={editingDay.title || ''}
                  onChange={(e) => setEditingDay({ ...editingDay, title: e.target.value })}
                  placeholder="Ex: TÓQUIO TRADICIONAL"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Subtítulo / Destaques</label>
                <input
                  type="text"
                  value={editingDay.subtitle || ''}
                  onChange={(e) => setEditingDay({ ...editingDay, subtitle: e.target.value })}
                  placeholder="Ex: Senso-ji • Ginza • Skytree"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Base / Cidade</label>
                  <input
                    type="text"
                    value={editingDay.base_location || ''}
                    onChange={(e) => setEditingDay({ ...editingDay, base_location: e.target.value })}
                    placeholder="Ex: Tóquio"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Ícone</label>
                  <input
                    type="text"
                    value={editingDay.icon || '📍'}
                    onChange={(e) => setEditingDay({ ...editingDay, icon: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Temperatura Mín (°C)</label>
                  <input
                    type="number"
                    value={editingDay.temperature_min ?? ''}
                    onChange={(e) =>
                      setEditingDay({
                        ...editingDay,
                        temperature_min: e.target.value ? parseInt(e.target.value, 10) : null,
                      })
                    }
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Temperatura Máx (°C)</label>
                  <input
                    type="number"
                    value={editingDay.temperature_max ?? ''}
                    onChange={(e) =>
                      setEditingDay({
                        ...editingDay,
                        temperature_max: e.target.value ? parseInt(e.target.value, 10) : null,
                      })
                    }
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Serviços Incluídos</label>
                <input
                  type="text"
                  value={editingDay.included_services || ''}
                  onChange={(e) => setEditingDay({ ...editingDay, included_services: e.target.value })}
                  placeholder="Ex: Café da manhã no hotel, Guia local"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Narrativa Editorial</label>
                <textarea
                  rows={3}
                  value={editingDay.narrative || ''}
                  onChange={(e) => setEditingDay({ ...editingDay, narrative: e.target.value })}
                  placeholder="Texto corrido ou introdução sobre o dia..."
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <div className="pt-4 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingDay(null)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-semibold"
                >
                  Salvar Alterações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDITAR ATIVIDADE */}
      {editingItem && (
        <div className="fixed inset-0 z-[100] overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200 p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-base font-bold text-slate-900">Editar Atividade</h3>
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateItem} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nome da Atração *</label>
                <input
                  type="text"
                  required
                  value={editingItem.item.title}
                  onChange={(e) =>
                    setEditingItem({
                      ...editingItem,
                      item: { ...editingItem.item, title: e.target.value },
                    })
                  }
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Horário de Início</label>
                  <input
                    type="time"
                    value={editingItem.item.start_time || ''}
                    onChange={(e) =>
                      setEditingItem({
                        ...editingItem,
                        item: { ...editingItem.item, start_time: e.target.value },
                      })
                    }
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Categoria</label>
                  <select
                    value={editingItem.item.category || 'ATTRACTION'}
                    onChange={(e) =>
                      setEditingItem({
                        ...editingItem,
                        item: { ...editingItem.item, category: e.target.value },
                      })
                    }
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
                  >
                    <option value="ATTRACTION">Atração Turística</option>
                    <option value="TEMPLE_SHRINE">Templo / Santuário</option>
                    <option value="MUSEUM">Museu / Arte</option>
                    <option value="RESTAURANT">Restaurante / Bar</option>
                    <option value="PARK">Parque / Natureza</option>
                    <option value="SHOPPING">Compras</option>
                    <option value="MEETING">Reunião / Evento</option>
                    <option value="OTHER">Outro</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Endereço / Localização</label>
                <input
                  type="text"
                  value={editingItem.item.address || ''}
                  onChange={(e) =>
                    setEditingItem({
                      ...editingItem,
                      item: { ...editingItem.item, address: e.target.value },
                    })
                  }
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Dica Especial (💡)</label>
                <input
                  type="text"
                  value={editingItem.item.tips || ''}
                  onChange={(e) =>
                    setEditingItem({
                      ...editingItem,
                      item: { ...editingItem.item, tips: e.target.value },
                    })
                  }
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              {hasMapCoordinates(editingItem.item) && (
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                  <div className="flex items-center gap-1.5 text-slate-700">
                    <GoogleMapsIcon className="w-3.5 h-3.5 shrink-0" />
                    <span className="font-mono text-[11px] text-slate-500">
                      GPS: {toFiniteCoordinate(editingItem.item.latitude)?.toFixed(5)}, {toFiniteCoordinate(editingItem.item.longitude)?.toFixed(5)}
                    </span>
                  </div>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${toFiniteCoordinate(editingItem.item.latitude)},${toFiniteCoordinate(editingItem.item.longitude)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-600 hover:text-brand-700 font-semibold text-[11px] hover:underline flex items-center gap-1"
                    title="Abrir coordenadas no Google Maps"
                  >
                    Ver no Google Maps <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}

              <div className="pt-4 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-semibold"
                >
                  Salvar Atividade
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADICIONAR DIA MANUALMENTE */}
      {showAddDayModal && (
        <div className="fixed inset-0 z-[100] overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200 p-6">
            <h3 className="text-base font-bold text-slate-900 mb-4">Adicionar Dia ao Roteiro</h3>
            <form onSubmit={handleCreateDay} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Data *</label>
                  <input
                    type="date"
                    required
                    value={newDayDate}
                    onChange={(e) => setNewDayDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Número do Dia</label>
                  <input
                    type="number"
                    value={newDayNumber}
                    onChange={(e) => setNewDayNumber(parseInt(e.target.value, 10))}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Título do Dia</label>
                <input
                  type="text"
                  value={newDayTitle}
                  onChange={(e) => setNewDayTitle(e.target.value)}
                  placeholder="Ex: DIA 2 • TÓQUIO TRADICIONAL"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Subtítulo / Destaques</label>
                <input
                  type="text"
                  value={newDaySubtitle}
                  onChange={(e) => setNewDaySubtitle(e.target.value)}
                  placeholder="Ex: Senso-ji • Ginza • Skytree"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Base / Cidade</label>
                  <input
                    type="text"
                    value={newDayBase}
                    onChange={(e) => setNewDayBase(e.target.value)}
                    placeholder="Ex: Tóquio"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Ícone</label>
                  <input
                    type="text"
                    value={newDayIcon}
                    onChange={(e) => setNewDayIcon(e.target.value)}
                    placeholder="Ex: 🌸, ✈️, 🗼, ⛩️"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>

              <div className="pt-4 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddDayModal(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-semibold"
                >
                  Salvar Dia
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADICIONAR ATIVIDADE */}
      {showAddItemModal && (
        <div className="fixed inset-0 z-[100] overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200 p-6">
            <h3 className="text-base font-bold text-slate-900 mb-4">Adicionar Atividade ao Roteiro</h3>
            <form onSubmit={handleCreateItem} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nome da Atração / Atividade *</label>
                <input
                  type="text"
                  required
                  value={itemTitle}
                  onChange={(e) => setItemTitle(e.target.value)}
                  placeholder="Ex: Templo Senso-ji, Jantar Kaiseki"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Horário Previsto</label>
                  <input
                    type="time"
                    value={itemTime}
                    onChange={(e) => setItemTime(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Categoria</label>
                  <select
                    value={itemCategory}
                    onChange={(e) => setItemCategory(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
                  >
                    <option value="ATTRACTION">Atração Turística</option>
                    <option value="TEMPLE_SHRINE">Templo / Santuário</option>
                    <option value="MUSEUM">Museu / Arte</option>
                    <option value="RESTAURANT">Restaurante / Bar</option>
                    <option value="PARK">Parque / Natureza</option>
                    <option value="SHOPPING">Compras</option>
                    <option value="MEETING">Reunião / Congresso</option>
                    <option value="OTHER">Outro</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Endereço / Localização</label>
                <input
                  type="text"
                  value={itemAddress}
                  onChange={(e) => setItemAddress(e.target.value)}
                  placeholder="Ex: 2-3-1 Asakusa, Taito, Tóquio"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Dica Especial (💡)</label>
                <input
                  type="text"
                  value={itemTips}
                  onChange={(e) => setItemTips(e.target.value)}
                  placeholder="Ex: Chegar 15 minutos antes para evitar filas"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <div className="pt-4 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddItemModal(null)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-semibold"
                >
                  Salvar Atividade
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

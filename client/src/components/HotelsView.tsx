import React, { useState, useEffect } from 'react';
import {
  Building,
  Plus,
  Trash2,
  Calendar,
  MapPin,
  CheckCircle2,
  Users,
  User,
  X,
  Check,
  Loader2,
  UserPlus,
  FileText,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react';
import { HotelReservation, HotelSubReservation, TripTraveler } from '../types/index.js';
import { api } from '../api/client.js';
import { formatDateBr } from '../utils/date.js';

interface HotelsViewProps {
  tripId: string;
  hotels: HotelReservation[];
  travelers?: TripTraveler[];
  onRefresh: () => void;
  canEdit: boolean;
}

export const HotelsView: React.FC<HotelsViewProps> = ({
  tripId,
  hotels,
  travelers = [],
  onRefresh,
  canEdit,
}) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [hotelName, setHotelName] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [checkInDate, setCheckInDate] = useState('');
  const [checkOutDate, setCheckOutDate] = useState('');
  const [resNumber, setResNumber] = useState('');
  const [roomType, setRoomType] = useState('Quarto Standard');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [notes, setNotes] = useState('');
  const [modalGuests, setModalGuests] = useState<string[]>([]);
  const [customModalGuest, setCustomModalGuest] = useState('');

  // Local state for hotels
  const [localHotels, setLocalHotels] = useState<HotelReservation[]>(hotels);

  useEffect(() => {
    setLocalHotels(hotels);
  }, [hotels]);

  // Active sub-reservation tab per hotel card: { [hotelId]: subReservationId }
  const [activeSubTabs, setActiveSubTabs] = useState<Record<string, string>>({});

  // Inline guest picker state per hotel card
  const [activeAddGuestHotelId, setActiveAddGuestHotelId] = useState<string | null>(null);
  const [customGuestInput, setCustomGuestInput] = useState('');
  const [updatingHotelId, setUpdatingHotelId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ hotelId: string; text: string } | null>(null);

  // Deletion modal state
  const [deleteModalData, setDeleteModalData] = useState<{
    hotelId: string;
    subId: string;
    hotelName: string;
    resNumber?: string | null;
    guestNames?: string | null;
    uploader?: string | null;
    amount?: string | null;
    docId?: string | null;
    docName?: string | null;
    isSingle: boolean;
  } | null>(null);
  const [deleteDocumentChecked, setDeleteDocumentChecked] = useState<boolean>(true);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Helper to parse comma/semicolon/newline-separated guests
  const parseGuests = (raw?: string | null): string[] => {
    if (!raw) return [];
    return raw
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
  };

  const handleUpdateGuests = async (hotelId: string, subId: string, updatedList: string[]) => {
    const newGuestNames = updatedList.join(', ');
    const prevHotels = localHotels;

    // Optimistic update
    setLocalHotels((prev) =>
      prev.map((h) => {
        if (h.id === hotelId) {
          const updatedSubs = h.sub_reservations?.map((s) =>
            s.id === subId ? { ...s, guest_names: newGuestNames } : s
          );
          return {
            ...h,
            guest_names: newGuestNames,
            sub_reservations: updatedSubs,
          };
        }
        return h;
      })
    );

    try {
      setUpdatingHotelId(subId);
      await api.reservations.updateHotel(tripId, subId, {
        guest_names: newGuestNames,
      });

      setStatusMessage({ hotelId, text: 'Hóspedes atualizados!' });
      setTimeout(() => setStatusMessage(null), 3000);
      onRefresh();
    } catch (err: any) {
      setLocalHotels(prevHotels);
      alert(err.message || 'Erro ao atualizar hóspedes da reserva');
    } finally {
      setUpdatingHotelId(null);
    }
  };

  const handleAddGuest = async (hotelId: string, subId: string, currentNames: string[], nameToAdd: string) => {
    const trimmed = nameToAdd.trim();
    if (!trimmed) return;
    const exists = currentNames.some((n) => n.toLowerCase() === trimmed.toLowerCase());
    if (exists) return;

    const newList = [...currentNames, trimmed];
    await handleUpdateGuests(hotelId, subId, newList);
    setCustomGuestInput('');
  };

  const handleRemoveGuest = async (hotelId: string, subId: string, currentNames: string[], nameToRemove: string) => {
    const newList = currentNames.filter((n) => n.toLowerCase() !== nameToRemove.toLowerCase());
    await handleUpdateGuests(hotelId, subId, newList);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.reservations.createHotel(tripId, {
        hotel_name: hotelName,
        city,
        address,
        check_in_date: checkInDate,
        check_out_date: checkOutDate,
        reservation_number: resNumber || null,
        room_type: roomType,
        total_amount: amount ? parseFloat(amount) : null,
        currency,
        notes: notes || null,
        guest_names: modalGuests.length > 0 ? modalGuests.join(', ') : null,
      });

      setShowAddModal(false);
      setHotelName('');
      setCity('');
      setAddress('');
      setCheckInDate('');
      setCheckOutDate('');
      setResNumber('');
      setRoomType('Quarto Standard');
      setAmount('');
      setNotes('');
      setModalGuests([]);
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Erro ao cadastrar hotel');
    }
  };

  const openDeleteModal = (
    h: HotelReservation,
    sub: HotelSubReservation | HotelReservation,
    isSingle: boolean
  ) => {
    const docId = sub.document_id || h.document_id;
    const docName = sub.document_name || h.document_name;
    const uploader = sub.uploader_name || sub.uploader_email || h.uploader_name || h.uploader_email;
    const resNum = sub.reservation_number || h.reservation_number;
    const guestNames = sub.guest_names || h.guest_names;
    const formattedAmount = sub.total_amount
      ? `${sub.currency || 'USD'} ${Number(sub.total_amount).toLocaleString('pt-BR')}`
      : null;

    setDeleteModalData({
      hotelId: h.id,
      subId: sub.id,
      hotelName: h.hotel_name,
      resNumber: resNum,
      guestNames,
      uploader,
      amount: formattedAmount,
      docId,
      docName,
      isSingle,
    });
    setDeleteDocumentChecked(Boolean(docId));
  };

  const handleConfirmDelete = async () => {
    if (!deleteModalData) return;
    setIsDeleting(true);

    try {
      await api.reservations.deleteHotel(tripId, deleteModalData.subId, {
        deleteDocument: deleteDocumentChecked,
      });

      // Optimistic update
      setLocalHotels((prev) => {
        return prev
          .map((h) => {
            if (h.id === deleteModalData.hotelId) {
              if (deleteModalData.isSingle || !h.sub_reservations || h.sub_reservations.length <= 1) {
                return null;
              }
              const remainingSubs = h.sub_reservations.filter((s) => s.id !== deleteModalData.subId);
              if (remainingSubs.length === 0) return null;
              return {
                ...h,
                sub_reservations: remainingSubs,
                guest_names: remainingSubs[0].guest_names,
                reservation_number: remainingSubs.map((s) => s.reservation_number).filter(Boolean).join(', '),
                total_amount: remainingSubs[0].total_amount,
              };
            }
            return h;
          })
          .filter(Boolean) as HotelReservation[];
      });

      setDeleteModalData(null);
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Erro ao excluir hospedagem');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold font-serif text-slate-900">Hospedagens & Hotéis</h2>
          <p className="text-xs text-slate-500">Hotéis, pousadas, ryokans tradicionais e vouchers de estadia</p>
        </div>
        {canEdit && (
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Cadastrar Hotel
          </button>
        )}
      </div>

      {localHotels.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 text-slate-400 text-xs">
          Nenhuma hospedagem cadastrada nesta viagem. Você pode enviar a confirmação de reserva na aba Documentos para preenchimento automático por IA!
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {localHotels.map((h) => {
            const hasMultipleSubs = Boolean(h.sub_reservations && h.sub_reservations.length > 1);
            const activeSubId = activeSubTabs[h.id] || (h.sub_reservations && h.sub_reservations[0]?.id) || h.id;
            const currentSub: HotelSubReservation | HotelReservation =
              hasMultipleSubs && h.sub_reservations
                ? h.sub_reservations.find((s) => s.id === activeSubId) || h.sub_reservations[0]
                : h;

            const guestList = parseGuests(currentSub.guest_names);
            const isAddingGuest = activeAddGuestHotelId === currentSub.id;
            const isUpdating = updatingHotelId === currentSub.id;

            return (
              <div key={h.id} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between transition-all">
                <div>
                  {/* Hotel Header */}
                  <div className="flex items-start justify-between pb-3 border-b border-slate-100 mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 bg-emerald-50 text-emerald-700 rounded-xl">
                        <Building className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-sm text-slate-900">{h.hotel_name}</h3>
                          {hasMultipleSubs && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-brand-50 text-brand-700 border border-brand-200">
                              {h.sub_reservations!.length} reservas
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-slate-500 flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-slate-400" />
                          {h.city || 'Destino'} {h.country ? `• ${h.country}` : ''}
                        </span>
                      </div>
                    </div>

                    {canEdit && (
                      <button
                        onClick={() => openDeleteModal(h, currentSub, !hasMultipleSubs)}
                        className="p-1 text-slate-400 hover:text-red-600 transition-colors cursor-pointer"
                        title={hasMultipleSubs ? 'Excluir esta reserva selecionada' : 'Excluir hospedagem'}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* SUB-RESERVAS TABS (When multiple reservations exist for this hotel) */}
                  {hasMultipleSubs && h.sub_reservations && (
                    <div className="mb-3.5 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                          <Building className="w-3.5 h-3.5 text-brand-600" />
                          Vouchers / Reservas Agrupadas ({h.sub_reservations.length})
                        </span>
                        <span className="text-[10px] text-slate-400">
                          Selecione para gerenciar individualmente
                        </span>
                      </div>

                      <div className="flex items-stretch gap-2 overflow-x-auto pb-1.5 scrollbar-thin">
                        {h.sub_reservations.map((sub, idx) => {
                          const isSelected = sub.id === currentSub.id;
                          return (
                            <button
                              key={sub.id}
                              type="button"
                              onClick={() => setActiveSubTabs((prev) => ({ ...prev, [h.id]: sub.id }))}
                              className={`flex-1 min-w-[220px] text-left p-2.5 rounded-xl border transition-all cursor-pointer ${
                                isSelected
                                  ? 'bg-brand-50/90 border-brand-500 ring-2 ring-brand-500/20 shadow-xs'
                                  : 'bg-slate-50/80 hover:bg-slate-100/90 border-slate-200 text-slate-600'
                              }`}
                            >
                              <div className="flex items-center justify-between text-xs mb-1">
                                <span className="font-bold text-slate-900 truncate">
                                  Reserva #{sub.reservation_number || idx + 1}
                                </span>
                                <div className="flex items-center gap-1.5 shrink-0 ml-1">
                                  {sub.total_amount && (
                                    <span className="font-bold text-brand-700 text-[11px]">
                                      {sub.currency} {Number(sub.total_amount).toLocaleString('pt-BR')}
                                    </span>
                                  )}
                                  {canEdit && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openDeleteModal(h, sub, false);
                                      }}
                                      className="p-1 text-slate-400 hover:text-red-600 rounded hover:bg-red-50 transition-colors cursor-pointer"
                                      title={`Excluir reserva #${sub.reservation_number || idx + 1}`}
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>
                              <div className="text-[11px] space-y-0.5">
                                <div className="flex items-center gap-1 text-slate-700 truncate">
                                  <span className="text-slate-400 font-normal shrink-0">Em nome de:</span>
                                  <strong className="font-medium text-slate-900 truncate">
                                    {sub.guest_names || 'Não informado'}
                                  </strong>
                                </div>
                                <div className="flex items-center gap-1 text-slate-500 truncate">
                                  <span className="text-slate-400 font-normal shrink-0">Enviado por:</span>
                                  <span className="truncate">{sub.uploader_name || sub.uploader_email || 'Manual'}</span>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Details of Current Reservation */}
                  <div className="space-y-2.5 text-xs">
                    <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-slate-400" />
                        <span>
                          Check-in: <strong>{formatDateBr(h.check_in_date)}</strong>
                        </span>
                      </div>
                      <span>
                        Check-out: <strong>{formatDateBr(h.check_out_date)}</strong>
                      </span>
                    </div>

                    {/* Single Stay Meta (Sender & Title holder) */}
                    {!hasMultipleSubs && (
                      <div className="flex items-center justify-between p-2 bg-slate-50/70 border border-slate-100 rounded-xl text-[11px]">
                        <div className="flex items-center gap-1 text-slate-600 truncate">
                          <span className="text-slate-400">Enviado por:</span>
                          <strong className="font-medium text-slate-800 truncate">
                            {h.uploader_name || h.uploader_email || 'Manual'}
                          </strong>
                        </div>
                        {currentSub.reservation_number && (
                          <div className="flex items-center gap-1 font-mono text-[11px]">
                            <span className="text-slate-400">Reserva:</span>
                            <span className="text-slate-900 font-bold bg-white px-1.5 py-0.5 rounded border border-slate-200">
                              #{currentSub.reservation_number}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {currentSub.room_type && (
                      <div className="text-slate-700">
                        Acomodação: <strong>{currentSub.room_type}</strong>
                      </div>
                    )}

                    {/* HÓSPEDES & ADIÇÃO RÁPIDA DE PARTICIPANTES */}
                    <div className="p-2.5 bg-slate-50/80 border border-slate-200/70 rounded-xl space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-slate-700 font-semibold text-xs">
                          <Users className="w-3.5 h-3.5 text-brand-600" />
                          <span>Hóspede(s) desta reserva:</span>
                          {isUpdating && <Loader2 className="w-3 h-3 text-brand-600 animate-spin ml-1" />}
                        </div>

                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => {
                              setActiveAddGuestHotelId(activeAddGuestHotelId === currentSub.id ? null : currentSub.id);
                              setCustomGuestInput('');
                            }}
                            className="inline-flex items-center gap-1 text-[11px] text-brand-600 hover:text-brand-700 font-semibold cursor-pointer transition-colors"
                          >
                            <Plus className="w-3 h-3 text-brand-600" />
                            <span>Adicionar</span>
                          </button>
                        )}
                      </div>

                      {/* Guest Badges List */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {guestList.length === 0 ? (
                          <span className="text-[11px] text-slate-400 italic">Nenhum hóspede vinculado</span>
                        ) : (
                          guestList.map((guestName) => (
                            <span
                              key={guestName}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-800 text-[11px] font-medium shadow-2xs"
                            >
                              <User className="w-3 h-3 text-slate-400" />
                              <span>{guestName}</span>
                              {canEdit && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveGuest(h.id, currentSub.id, guestList, guestName)}
                                  disabled={isUpdating}
                                  className="text-slate-400 hover:text-red-500 rounded p-0.5 hover:bg-slate-100 transition-colors cursor-pointer"
                                  title={`Remover ${guestName} desta reserva`}
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              )}
                            </span>
                          ))
                        )}
                      </div>

                      {/* Status feedback message */}
                      {statusMessage && statusMessage.hotelId === h.id && (
                        <p className="text-[11px] font-medium text-emerald-700 flex items-center gap-1">
                          <Check className="w-3 h-3" /> {statusMessage.text}
                        </p>
                      )}

                      {/* Popover / Suggestions Panel */}
                      {isAddingGuest && (
                        <div className="mt-2 pt-2 border-t border-slate-200/80 space-y-2 bg-white p-3 rounded-lg border shadow-xs animate-in fade-in duration-150">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
                              <UserPlus className="w-3.5 h-3.5 text-brand-600" />
                              Sugerir Participantes da Viagem
                            </span>
                            <button
                              type="button"
                              onClick={() => setActiveAddGuestHotelId(null)}
                              className="text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* Suggested travelers list */}
                          {travelers.length > 0 ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-36 overflow-y-auto pr-1">
                              {travelers.map((traveler) => {
                                const alreadyAdded = guestList.some(
                                  (g) => g.toLowerCase() === traveler.display_name.toLowerCase()
                                );

                                return (
                                  <button
                                    key={traveler.id}
                                    type="button"
                                    disabled={alreadyAdded || isUpdating}
                                    onClick={() => handleAddGuest(h.id, currentSub.id, guestList, traveler.display_name)}
                                    className={`flex items-center justify-between p-1.5 rounded-lg border text-left text-xs transition-colors cursor-pointer ${
                                      alreadyAdded
                                        ? 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed'
                                        : 'bg-white hover:bg-brand-50 border-slate-200 hover:border-brand-300 text-slate-800'
                                    }`}
                                  >
                                    <span className="flex items-center gap-1.5 truncate">
                                      <User className={`w-3 h-3 ${alreadyAdded ? 'text-slate-400' : 'text-brand-600'} shrink-0`} />
                                      <span className="font-medium truncate">{traveler.display_name}</span>
                                      {traveler.role === 'COMPANION' && (
                                        <span className="text-[9px] px-1 py-0.2 bg-slate-100 text-slate-500 rounded font-normal shrink-0">
                                          Acomp.
                                        </span>
                                      )}
                                    </span>

                                    {alreadyAdded ? (
                                      <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-0.5 shrink-0">
                                        <Check className="w-3 h-3" /> Adicionado
                                      </span>
                                    ) : (
                                      <Plus className="w-3.5 h-3.5 text-brand-600 shrink-0 ml-1" />
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          ) : (
                            <p className="text-[11px] text-slate-400 italic">Nenhum participante registrado nesta viagem.</p>
                          )}

                          {/* Custom Name Input */}
                          <div className="pt-2 border-t border-slate-100 flex items-center gap-1.5">
                            <input
                              type="text"
                              value={customGuestInput}
                              onChange={(e) => setCustomGuestInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleAddGuest(h.id, currentSub.id, guestList, customGuestInput);
                                }
                              }}
                              placeholder="Ou digite outro nome..."
                              className="flex-1 px-2.5 py-1 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:outline-none"
                            />
                            <button
                              type="button"
                              disabled={!customGuestInput.trim() || isUpdating}
                              onClick={() => handleAddGuest(h.id, currentSub.id, guestList, customGuestInput)}
                              className="px-2.5 py-1 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold cursor-pointer transition-colors"
                            >
                              Adicionar
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {h.address && (
                      <div className="text-slate-500 text-[11px] flex items-start gap-1">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                        <span>{h.address}</span>
                      </div>
                    )}

                    {/* Linked Document Info */}
                    {currentSub.document_id && (
                      <div className="flex items-center justify-between p-2 bg-purple-50/70 border border-purple-100 rounded-xl text-[11px]">
                        <div className="flex items-center gap-1.5 text-purple-900 truncate">
                          <FileText className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                          <span className="truncate">{currentSub.document_name || 'Comprovante anexado'}</span>
                        </div>
                        <a
                          href={api.documents.viewUrl(currentSub.document_id)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[10px] font-semibold text-purple-700 hover:text-purple-900 flex items-center gap-0.5 shrink-0 ml-2"
                        >
                          Ver PDF <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    )}

                    {currentSub.notes && (
                      <div className="p-2 bg-amber-50/60 border border-amber-200/50 rounded-lg text-amber-900 text-[11px]">
                        {currentSub.notes}
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer with Sub-reserva Delete & Amount */}
                <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full font-semibold text-[10px] flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      {currentSub.payment_status || h.payment_status || 'Confirmado'}
                    </span>

                    {hasMultipleSubs && canEdit && (
                      <button
                        type="button"
                        onClick={() => openDeleteModal(h, currentSub, false)}
                        className="text-[11px] text-red-600 hover:text-red-700 font-semibold inline-flex items-center gap-1 px-2 py-0.5 rounded-md hover:bg-red-50 transition-colors cursor-pointer"
                        title="Excluir apenas esta reserva individual"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Excluir esta reserva</span>
                      </button>
                    )}
                  </div>

                  {currentSub.total_amount ? (
                    <span className="font-bold text-slate-900 text-sm">
                      {currentSub.currency || h.currency} {Number(currentSub.total_amount).toLocaleString('pt-BR')}
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Confirmation Modal for Hotel / Sub-reserva Deletion with Document Option */}
      {deleteModalData && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3 mb-4">
              <div className="p-2.5 bg-red-50 text-red-600 rounded-xl shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {deleteModalData.isSingle ? 'Excluir Reserva de Hospedagem' : 'Excluir Sub-Reserva Individual'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Esta ação removerá a reserva de <strong>{deleteModalData.hotelName}</strong> da viagem.
                </p>
              </div>
            </div>

            {/* Reservation Details Box */}
            <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl space-y-2 text-xs mb-4">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Titular / Em nome de:</span>
                <strong className="text-slate-900">{deleteModalData.guestNames || 'Não informado'}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Enviado por:</span>
                <span className="text-slate-700">{deleteModalData.uploader || 'Manual'}</span>
              </div>
              {deleteModalData.resNumber && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-medium">Código da Reserva:</span>
                  <span className="font-mono font-semibold text-slate-900 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                    #{deleteModalData.resNumber}
                  </span>
                </div>
              )}
              {deleteModalData.amount && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-medium">Valor da Reserva:</span>
                  <strong className="text-brand-700">{deleteModalData.amount}</strong>
                </div>
              )}
            </div>

            {/* Linked Document Cascading Checkbox */}
            {deleteModalData.docId && (
              <label className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50/70 border border-amber-200/80 mb-5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={deleteDocumentChecked}
                  onChange={(e) => setDeleteDocumentChecked(e.target.checked)}
                  className="w-4 h-4 text-brand-600 rounded border-slate-300 focus:ring-brand-500 mt-0.5 cursor-pointer"
                />
                <div className="text-xs">
                  <span className="font-semibold text-amber-950 block">
                    Excluir também o documento associado em Documentos & IA
                  </span>
                  <span className="text-amber-800 text-[11px] block mt-0.5 truncate max-w-[280px]">
                    {deleteModalData.docName || 'Comprovante vinculado'}
                  </span>
                </div>
              </label>
            )}

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeleteModalData(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
              >
                {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                <span>{isDeleting ? 'Excluindo...' : 'Confirmar Exclusão'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 border border-slate-200">
            <h3 className="text-base font-bold text-slate-900 mb-4">Cadastrar Hospedagem</h3>
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nome do Hotel / Ryokan *</label>
                <input
                  type="text"
                  required
                  value={hotelName}
                  onChange={(e) => setHotelName(e.target.value)}
                  placeholder="Ex: Hotel Intergate Kanazawa"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Cidade</label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Ex: Kanazawa"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Código da Reserva</label>
                  <input
                    type="text"
                    value={resNumber}
                    onChange={(e) => setResNumber(e.target.value)}
                    placeholder="Ex: INTG-882190"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Data Check-in *</label>
                  <input
                    type="date"
                    required
                    value={checkInDate}
                    onChange={(e) => setCheckInDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Data Check-out *</label>
                  <input
                    type="date"
                    required
                    value={checkOutDate}
                    onChange={(e) => setCheckOutDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Tipo de Quarto</label>
                <input
                  type="text"
                  value={roomType}
                  onChange={(e) => setRoomType(e.target.value)}
                  placeholder="Ex: Superior Twin, Tatami Suite"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:outline-none"
                />
              </div>

              {/* HÓSPEDES SELECTION IN CREATE MODAL */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700">Hóspede(s) da Reserva</label>
                {travelers.length > 0 && (
                  <div className="p-2 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                      Participantes Cadastrados:
                    </span>
                    <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                      {travelers.map((t) => {
                        const isSelected = modalGuests.includes(t.display_name);
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => {
                              if (isSelected) {
                                setModalGuests(modalGuests.filter((g) => g !== t.display_name));
                              } else {
                                setModalGuests([...modalGuests, t.display_name]);
                              }
                            }}
                            className={`px-2.5 py-1 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition-colors cursor-pointer ${
                              isSelected
                                ? 'bg-brand-50 border-brand-500 text-brand-700 font-semibold'
                                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            <User className="w-3 h-3 text-slate-400" />
                            <span>{t.display_name}</span>
                            {isSelected && <Check className="w-3 h-3 text-brand-600" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={customModalGuest}
                    onChange={(e) => setCustomModalGuest(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (customModalGuest.trim() && !modalGuests.includes(customModalGuest.trim())) {
                          setModalGuests([...modalGuests, customModalGuest.trim()]);
                          setCustomModalGuest('');
                        }
                      }
                    }}
                    placeholder="Ou adicione outro nome de hóspede..."
                    className="flex-1 px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (customModalGuest.trim() && !modalGuests.includes(customModalGuest.trim())) {
                        setModalGuests([...modalGuests, customModalGuest.trim()]);
                        setCustomModalGuest('');
                      }
                    }}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg cursor-pointer"
                  >
                    Adicionar
                  </button>
                </div>

                {modalGuests.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {modalGuests.map((g) => (
                      <span
                        key={g}
                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 border border-slate-200 text-slate-700 rounded text-[11px]"
                      >
                        {g}
                        <button
                          type="button"
                          onClick={() => setModalGuests(modalGuests.filter((x) => x !== g))}
                          className="hover:text-red-500 cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Valor Total</label>
                  <input
                    type="number"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Moeda</label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:outline-none"
                  >
                    <option value="BRL">BRL (R$)</option>
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="JPY">JPY (¥)</option>
                    <option value="GBP">GBP (£)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Endereço Completo</label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Ex: Takaokamachi 2-5, Kanazawa"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Observações</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Instruções de check-in, café da manhã incluso, etc."
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-semibold cursor-pointer"
                >
                  Salvar Hospedagem
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

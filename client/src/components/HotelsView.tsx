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
} from 'lucide-react';
import { HotelReservation, TripTraveler } from '../types/index.js';
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

  // Inline guest picker state per hotel card
  const [localHotels, setLocalHotels] = useState<HotelReservation[]>(hotels);

  useEffect(() => {
    setLocalHotels(hotels);
  }, [hotels]);

  const [activeAddGuestHotelId, setActiveAddGuestHotelId] = useState<string | null>(null);
  const [customGuestInput, setCustomGuestInput] = useState('');
  const [updatingHotelId, setUpdatingHotelId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ hotelId: string; text: string } | null>(null);

  // Helper to parse comma/semicolon/newline-separated guests
  const parseGuests = (raw?: string | null): string[] => {
    if (!raw) return [];
    return raw
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
  };

  const handleUpdateGuests = async (hotelId: string, updatedList: string[]) => {
    const newGuestNames = updatedList.join(', ');
    const prevHotels = localHotels;

    // 1. Instant optimistic update
    setLocalHotels((prev) =>
      prev.map((h) => (h.id === hotelId ? { ...h, guest_names: newGuestNames } : h))
    );

    try {
      setUpdatingHotelId(hotelId);
      await api.reservations.updateHotel(tripId, hotelId, {
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

  const handleAddGuest = async (hotelId: string, currentNames: string[], nameToAdd: string) => {
    const trimmed = nameToAdd.trim();
    if (!trimmed) return;
    const exists = currentNames.some((n) => n.toLowerCase() === trimmed.toLowerCase());
    if (exists) return;

    const newList = [...currentNames, trimmed];
    await handleUpdateGuests(hotelId, newList);
    setCustomGuestInput('');
  };

  const handleRemoveGuest = async (hotelId: string, currentNames: string[], nameToRemove: string) => {
    const newList = currentNames.filter((n) => n.toLowerCase() !== nameToRemove.toLowerCase());
    await handleUpdateGuests(hotelId, newList);
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

  const handleDelete = async (id: string) => {
    if (!window.confirm('Excluir esta hospedagem?')) return;
    const prevHotels = localHotels;
    setLocalHotels((prev) => prev.filter((h) => h.id !== id));
    try {
      await api.reservations.deleteHotel(tripId, id);
      onRefresh();
    } catch (err: any) {
      setLocalHotels(prevHotels);
      alert(err.message || 'Erro ao excluir hotel');
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
            const guestList = parseGuests(h.guest_names);
            const isAddingGuest = activeAddGuestHotelId === h.id;
            const isUpdating = updatingHotelId === h.id;

            return (
              <div key={h.id} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between transition-all">
                <div>
                  <div className="flex items-start justify-between pb-3 border-b border-slate-100 mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 bg-emerald-50 text-emerald-700 rounded-xl">
                        <Building className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-bold text-sm text-slate-900">{h.hotel_name}</h3>
                        <span className="text-[11px] text-slate-500 flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-slate-400" />
                          {h.city || 'Destino'} {h.country ? `• ${h.country}` : ''}
                        </span>
                      </div>
                    </div>

                    {canEdit && (
                      <button onClick={() => handleDelete(h.id)} className="p-1 text-slate-400 hover:text-red-600 cursor-pointer" title="Excluir hospedagem">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* Details */}
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

                    {h.room_type && (
                      <div className="text-slate-700">
                        Acomodação: <strong>{h.room_type}</strong>
                      </div>
                    )}

                    {/* HÓSPEDES & ADIÇÃO RÁPIDA DE PARTICIPANTES */}
                    <div className="p-2.5 bg-slate-50/80 border border-slate-200/70 rounded-xl space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-slate-700 font-semibold text-xs">
                          <Users className="w-3.5 h-3.5 text-brand-600" />
                          <span>Hóspede(s):</span>
                          {isUpdating && <Loader2 className="w-3 h-3 text-brand-600 animate-spin ml-1" />}
                        </div>

                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => {
                              setActiveAddGuestHotelId(isAddingGuest ? null : h.id);
                              setCustomGuestInput('');
                            }}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-semibold bg-white hover:bg-brand-50 text-brand-700 border border-brand-200 transition-colors cursor-pointer shadow-2xs"
                            title="Adicionar participante da viagem ou novo hóspede"
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
                                  onClick={() => handleRemoveGuest(h.id, guestList, guestName)}
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
                                    onClick={() => handleAddGuest(h.id, guestList, traveler.display_name)}
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
                                  handleAddGuest(h.id, guestList, customGuestInput);
                                }
                              }}
                              placeholder="Ou digite outro nome..."
                              className="flex-1 px-2.5 py-1 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:outline-none"
                            />
                            <button
                              type="button"
                              disabled={!customGuestInput.trim() || isUpdating}
                              onClick={() => handleAddGuest(h.id, guestList, customGuestInput)}
                              className="px-2.5 py-1 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold cursor-pointer transition-colors"
                            >
                              Adicionar
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {h.reservation_number && (
                      <div className="text-slate-600 flex items-center gap-1 font-mono text-[11px]">
                        <span>Código da Reserva:</span>
                        <strong className="text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded">
                          {h.reservation_number}
                        </strong>
                      </div>
                    )}

                    {h.address && (
                      <div className="text-slate-500 text-[11px] flex items-start gap-1">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                        <span>{h.address}</span>
                      </div>
                    )}

                    {h.notes && (
                      <div className="p-2 bg-amber-50/60 border border-amber-200/50 rounded-lg text-amber-900 text-[11px]">
                        {h.notes}
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer */}
                <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full font-semibold text-[10px] flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    {h.payment_status || 'Confirmado'}
                  </span>

                  {h.total_amount && (
                    <span className="font-bold text-slate-900">
                      {h.currency} {h.total_amount}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
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
                <label className="block text-xs font-semibold text-slate-700">Hóspedes da Reserva</label>
                {travelers.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-1.5">
                    {travelers.map((t) => {
                      const selected = modalGuests.includes(t.display_name);
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            setModalGuests((prev) =>
                              selected ? prev.filter((n) => n !== t.display_name) : [...prev, t.display_name]
                            );
                          }}
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                            selected
                              ? 'bg-brand-50 border-brand-300 text-brand-700'
                              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <User className="w-3 h-3 text-slate-400" />
                          <span>{t.display_name}</span>
                          {selected && <Check className="w-3 h-3 text-brand-600" />}
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={customModalGuest}
                    onChange={(e) => setCustomModalGuest(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (customModalGuest.trim() && !modalGuests.includes(customModalGuest.trim())) {
                          setModalGuests((prev) => [...prev, customModalGuest.trim()]);
                          setCustomModalGuest('');
                        }
                      }
                    }}
                    placeholder="Outro hóspede..."
                    className="flex-1 px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    disabled={!customModalGuest.trim()}
                    onClick={() => {
                      if (customModalGuest.trim() && !modalGuests.includes(customModalGuest.trim())) {
                        setModalGuests((prev) => [...prev, customModalGuest.trim()]);
                        setCustomModalGuest('');
                      }
                    }}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer"
                  >
                    Adicionar
                  </button>
                </div>

                {modalGuests.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {modalGuests.map((g) => (
                      <span
                        key={g}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-slate-800 text-[11px]"
                      >
                        {g}
                        <button
                          type="button"
                          onClick={() => setModalGuests((prev) => prev.filter((n) => n !== g))}
                          className="text-slate-400 hover:text-red-500"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Endereço Completo</label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Ex: 1-2-1 Takaokamachi, Kanazawa"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:outline-none"
                />
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
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-brand-500 focus:outline-none"
                  >
                    <option value="JPY">JPY (¥)</option>
                    <option value="USD">USD ($)</option>
                    <option value="BRL">BRL (R$)</option>
                    <option value="EUR">EUR (€)</option>
                  </select>
                </div>
              </div>

              <div className="pt-4 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-semibold cursor-pointer shadow-sm"
                >
                  Salvar Hotel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

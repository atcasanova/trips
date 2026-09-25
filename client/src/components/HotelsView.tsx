import React, { useState } from 'react';
import { Building, Plus, Trash2, Calendar, MapPin, Phone, Globe, DollarSign, CheckCircle2 } from 'lucide-react';
import { HotelReservation } from '../types/index.js';
import { api } from '../api/client.js';
import { formatDateBr } from '../utils/date.js';

interface HotelsViewProps {
  tripId: string;
  hotels: HotelReservation[];
  onRefresh: () => void;
  canEdit: boolean;
}

export const HotelsView: React.FC<HotelsViewProps> = ({ tripId, hotels, onRefresh, canEdit }) => {
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
      });

      setShowAddModal(false);
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Erro ao cadastrar hotel');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Excluir esta hospedagem?')) return;
    try {
      await api.reservations.deleteHotel(tripId, id);
      onRefresh();
    } catch (err: any) {
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
            className="flex items-center gap-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" /> Cadastrar Hotel
          </button>
        )}
      </div>

      {hotels.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 text-slate-400 text-xs">
          Nenhuma hospedagem cadastrada nesta viagem. Você pode enviar a confirmação de reserva na aba Documentos para preenchimento automático por IA!
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {hotels.map((h) => (
            <div key={h.id} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between">
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
                    <button onClick={() => handleDelete(h.id)} className="p-1 text-slate-400 hover:text-red-600">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Details */}
                <div className="space-y-2 text-xs">
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
          ))}
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
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
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
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Código da Reserva</label>
                  <input
                    type="text"
                    value={resNumber}
                    onChange={(e) => setResNumber(e.target.value)}
                    placeholder="Ex: INTG-882190"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
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
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Data Check-out *</label>
                  <input
                    type="date"
                    required
                    value={checkOutDate}
                    onChange={(e) => setCheckOutDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
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
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Endereço Completo</label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Ex: 1-2-1 Takaokamachi, Kanazawa"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
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
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Moeda</label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
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
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-semibold"
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

import React, { useState } from 'react';
import { Plane, Train, Bus, Car, Ship, Plus, Trash2, Clock, Calendar, ArrowRight, ShieldCheck } from 'lucide-react';
import { TransportReservation, TransportSegment } from '../types/index.js';
import { api } from '../api/client.js';

interface TransportsViewProps {
  tripId: string;
  transports: TransportReservation[];
  onRefresh: () => void;
  canEdit: boolean;
}

export const TransportsView: React.FC<TransportsViewProps> = ({ tripId, transports, onRefresh, canEdit }) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [type, setType] = useState('FLIGHT');
  const [provider, setProvider] = useState('');
  const [bookingCode, setBookingCode] = useState('');
  const [ticketNumber, setTicketNumber] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [currency, setCurrency] = useState('USD');

  // Segment
  const [flightNumber, setFlightNumber] = useState('');
  const [depCity, setDepCity] = useState('');
  const [depDate, setDepDate] = useState('');
  const [depTime, setDepTime] = useState('');
  const [arrCity, setArrCity] = useState('');
  const [arrDate, setArrDate] = useState('');
  const [arrTime, setArrTime] = useState('');
  const [seat, setSeat] = useState('');
  const [cabin, setCabin] = useState('Economy');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.reservations.createTransport(tripId, {
        type,
        provider_name: provider,
        booking_code: bookingCode,
        ticket_number: ticketNumber,
        total_amount: totalAmount ? parseFloat(totalAmount) : null,
        currency,
        segments: [
          {
            identification_number: flightNumber,
            departure_location: depCity,
            departure_date: depDate,
            departure_time: depTime,
            arrival_location: arrCity,
            arrival_date: arrDate,
            arrival_time: arrTime,
            seat,
            cabin_class: cabin,
          },
        ],
      });

      setShowAddModal(false);
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Erro ao cadastrar transporte');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Excluir esta reserva de transporte?')) return;
    try {
      await api.reservations.deleteTransport(tripId, id);
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Erro ao excluir transporte');
    }
  };

  const getTransportIcon = (t: string) => {
    switch (t) {
      case 'TRAIN':
        return <Train className="w-5 h-5 text-indigo-600" />;
      case 'BUS':
        return <Bus className="w-5 h-5 text-emerald-600" />;
      case 'CAR':
        return <Car className="w-5 h-5 text-amber-600" />;
      case 'BOAT':
        return <Ship className="w-5 h-5 text-cyan-600" />;
      default:
        return <Plane className="w-5 h-5 text-sky-600 -rotate-45" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold font-serif text-slate-900">Transportes & Voos</h2>
          <p className="text-xs text-slate-500">Passagens aéreas, trens de alta velocidade (Shinkansen) e traslados</p>
        </div>
        {canEdit && (
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" /> Cadastrar Transporte
          </button>
        )}
      </div>

      {transports.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 text-slate-400 text-xs">
          Nenhuma reserva de voo ou transporte cadastrada. Envie um PDF de passagem na aba Documentos para extrair automaticamente com IA!
        </div>
      ) : (
        <div className="space-y-4">
          {transports.map((tr) => (
            <div key={tr.id} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              {/* Header */}
              <div className="flex items-start justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-xl">
                    {getTransportIcon(tr.type)}
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                      {tr.provider_name || 'Transporte'}
                      {tr.booking_code && (
                        <span className="px-2 py-0.5 bg-brand-50 text-brand-700 border border-brand-200 font-mono text-xs rounded-md">
                          PNR: {tr.booking_code}
                        </span>
                      )}
                    </h3>
                    <span className="text-[11px] text-slate-500">
                      {tr.type === 'FLIGHT' ? 'Voo Comercial' : tr.type} • Status: {tr.status}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {tr.total_amount && (
                    <span className="text-xs font-bold text-slate-800">
                      {tr.currency} {tr.total_amount}
                    </span>
                  )}
                  {canEdit && (
                    <button onClick={() => handleDelete(tr.id)} className="p-1 text-slate-400 hover:text-red-600">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Segments */}
              <div className="mt-4 space-y-3">
                {tr.segments && tr.segments.length > 0 ? (
                  tr.segments.map((seg, idx) => (
                    <div
                      key={seg.id || idx}
                      className="p-3.5 bg-slate-50/80 rounded-xl border border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex items-center gap-3">
                        <div className="font-mono font-bold text-slate-800 px-2 py-1 bg-white border border-slate-200 rounded">
                          {seg.identification_number || seg.carrier_name || `Trecho ${idx + 1}`}
                        </div>

                        <div>
                          <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                            <span>{seg.departure_location}</span>
                            <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                            <span>{seg.arrival_location}</span>
                          </div>
                          <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                            <span>Partida: {seg.departure_date} {seg.departure_time || ''}</span>
                            <span>•</span>
                            <span>Chegada: {seg.arrival_date} {seg.arrival_time || ''}</span>
                          </div>
                          {(() => {
                            const paxList: Array<{ name: string; seat?: string | null }> = Array.isArray(seg.passengers) && seg.passengers.length > 0
                              ? seg.passengers
                              : Array.isArray(seg.passenger_names)
                              ? seg.passenger_names.map((p: any) => typeof p === 'string' ? { name: p } : { name: p.name || p.displayName, seat: p.seat })
                              : [];
                            if (paxList.length === 0) return null;
                            return (
                              <div className="mt-1 text-[11px] text-blue-800 bg-blue-50/80 px-2 py-0.5 rounded border border-blue-100/80 inline-flex items-center gap-1.5 flex-wrap">
                                <span>👤 Passageiro(s){paxList.length > 1 ? ` (${paxList.length})` : ''}:</span>
                                <strong>
                                  {paxList.map((p) => p.seat ? `${p.name} (Assento: ${p.seat})` : p.name).join(', ')}
                                </strong>
                              </div>
                            );
                          })()}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 text-[11px] text-slate-600">
                        {seg.seat && <span>Assento: <strong>{seg.seat}</strong></span>}
                        {seg.cabin_class && <span className="capitalize">{seg.cabin_class}</span>}
                        {seg.duration_minutes && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-400" />
                            {Math.floor(seg.duration_minutes / 60)}h{seg.duration_minutes % 60}m
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-400 italic">Sem trechos detalhados</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 border border-slate-200">
            <h3 className="text-base font-bold text-slate-900 mb-4">Adicionar Reserva de Transporte</h3>
            <form onSubmit={handleCreate} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Tipo</label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="FLIGHT">Voo (Avião)</option>
                    <option value="TRAIN">Trem (Shinkansen / Trem-bala)</option>
                    <option value="BUS">Ônibus</option>
                    <option value="CAR">Carro / Aluguel</option>
                    <option value="TRANSFER">Transfer / Traslado</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Companhia / Operadora</label>
                  <input
                    type="text"
                    required
                    value={provider}
                    onChange={(e) => setProvider(e.target.value)}
                    placeholder="Ex: United Airlines, JR East"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Código PNR</label>
                  <input
                    type="text"
                    value={bookingCode}
                    onChange={(e) => setBookingCode(e.target.value)}
                    placeholder="Ex: EBTWNY"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Número do Voo</label>
                  <input
                    type="text"
                    value={flightNumber}
                    onChange={(e) => setFlightNumber(e.target.value)}
                    placeholder="Ex: UA 842"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Assento</label>
                  <input
                    type="text"
                    value={seat}
                    onChange={(e) => setSeat(e.target.value)}
                    placeholder="Ex: 14A"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Origem (Cidade/Aeroporto)</label>
                  <input
                    type="text"
                    required
                    value={depCity}
                    onChange={(e) => setDepCity(e.target.value)}
                    placeholder="Ex: São Paulo (GRU)"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Destino</label>
                  <input
                    type="text"
                    required
                    value={arrCity}
                    onChange={(e) => setArrCity(e.target.value)}
                    placeholder="Ex: Chicago (ORD)"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Data Partida</label>
                  <input
                    type="date"
                    required
                    value={depDate}
                    onChange={(e) => setDepDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Horário Partida</label>
                  <input
                    type="time"
                    value={depTime}
                    onChange={(e) => setDepTime(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Data Chegada</label>
                  <input
                    type="date"
                    required
                    value={arrDate}
                    onChange={(e) => setArrDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Horário Chegada</label>
                  <input
                    type="time"
                    value={arrTime}
                    onChange={(e) => setArrTime(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
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
                  Salvar Reserva
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState } from 'react';
import {
  Plane,
  Train,
  Bus,
  Car,
  Ship,
  Plus,
  Trash2,
  Clock,
  Calendar,
  ArrowRight,
  ShieldCheck,
  User,
  FileText,
  Loader2,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { TransportReservation, TransportSegment } from '../types/index.js';
import { api } from '../api/client.js';

interface TransportsViewProps {
  tripId: string;
  transports: TransportReservation[];
  onRefresh: () => void;
  canEdit: boolean;
}

export const TransportsView: React.FC<TransportsViewProps> = ({ tripId, transports, onRefresh, canEdit }) => {
  const [localTransports, setLocalTransports] = useState<TransportReservation[]>(transports);

  React.useEffect(() => {
    setLocalTransports(transports);
  }, [transports]);

  const [showAddModal, setShowAddModal] = useState(false);
  const [type, setType] = useState('FLIGHT');
  const [provider, setProvider] = useState('');
  const [bookingCode, setBookingCode] = useState('');
  const [ticketNumber, setTicketNumber] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [currency, setCurrency] = useState('USD');

  // Deletion modal state
  const [deleteModalData, setDeleteModalData] = useState<{
    id: string;
    carrier: string;
    code?: string | null;
    route?: string | null;
    pax?: string | null;
    uploader?: string | null;
    amount?: string | null;
    docId?: string | null;
    docName?: string | null;
    expenseId?: string | null;
    expenseDesc?: string | null;
    expenseAmount?: number | null;
    expenseCurrency?: string | null;
  } | null>(null);
  const [deleteDocumentChecked, setDeleteDocumentChecked] = useState<boolean>(true);
  const [deleteExpenseChecked, setDeleteExpenseChecked] = useState<boolean>(true);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [addTransportError, setAddTransportError] = useState<string | null>(null);

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
    setAddTransportError(null);
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
      setAddTransportError(err.message || 'Erro ao cadastrar transporte');
    }
  };

  const openDeleteModal = (tr: TransportReservation) => {
    const firstSeg = tr.segments && tr.segments.length > 0 ? tr.segments[0] : null;
    const lastSeg = tr.segments && tr.segments.length > 0 ? tr.segments[tr.segments.length - 1] : null;
    const route = firstSeg && lastSeg ? `${firstSeg.departure_location} → ${lastSeg.arrival_location}` : null;

    // Collect passengers
    const paxNames: string[] = [];
    if (tr.segments) {
      for (const seg of tr.segments) {
        if (Array.isArray(seg.passengers)) {
          seg.passengers.forEach((p) => {
            if (p.name && !paxNames.includes(p.name)) paxNames.push(p.name);
          });
        }
      }
    }

    setDeleteModalData({
      id: tr.id,
      carrier: tr.provider_name || 'Transporte',
      code: tr.booking_code,
      route,
      pax: paxNames.join(', '),
      uploader: tr.uploader_name || tr.uploader_email || 'Manual',
      amount: tr.total_amount ? `${tr.currency || 'USD'} ${Number(tr.total_amount).toLocaleString('pt-BR')}` : null,
      docId: tr.document_id,
      docName: tr.document_name,
      expenseId: tr.expense_id,
      expenseDesc: tr.expense_description,
      expenseAmount: tr.expense_amount,
      expenseCurrency: tr.expense_currency,
    });
    setDeleteDocumentChecked(Boolean(tr.document_id));
    setDeleteExpenseChecked(Boolean(tr.expense_id));
    setDeleteError(null);
  };

  const handleConfirmDelete = async () => {
    if (!deleteModalData) return;
    setIsDeleting(true);
    setDeleteError(null);
    const id = deleteModalData.id;
    const prev = localTransports;
    setLocalTransports((current) => current.filter((t) => t.id !== id));
    try {
      await api.reservations.deleteTransport(tripId, id, {
        deleteDocument: deleteDocumentChecked,
        deleteExpense: deleteExpenseChecked,
      });
      setDeleteModalData(null);
      onRefresh();
    } catch (err: any) {
      setLocalTransports(prev);
      setDeleteError(err.message || 'Erro ao excluir transporte');
    } finally {
      setIsDeleting(false);
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

      {localTransports.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 text-slate-400 text-xs">
          Nenhuma reserva de voo ou transporte cadastrada. Envie um PDF de passagem na aba Documentos para extrair automaticamente com IA!
        </div>
      ) : (
        <div className="space-y-4">
          {localTransports
            .filter((tr) => {
              if (tr.segments && tr.segments.length > 0) return true;
              if (tr.booking_code) {
                const existsInOther = transports.some(
                  (other) =>
                    other.id !== tr.id &&
                    other.segments &&
                    other.segments.some((s) => {
                      const pnames = Array.isArray(s.passenger_names) ? s.passenger_names : [];
                      return pnames.some((p: any) => typeof p === 'object' && p?.bookingCode === tr.booking_code);
                    })
                );
                if (existsInOther) return false;
              }
              return true;
            })
            .map((tr) => {
              // Extract all unique booking codes for this reservation
              const bookingCodes: string[] = [];
              if (tr.booking_code) bookingCodes.push(tr.booking_code);
              if (Array.isArray(tr.segments)) {
                for (const s of tr.segments) {
                  const pnames = Array.isArray(s.passenger_names) ? s.passenger_names : [];
                  for (const p of pnames) {
                    if (typeof p === 'object' && p?.bookingCode && !bookingCodes.includes(p.bookingCode)) {
                      bookingCodes.push(p.bookingCode);
                    }
                  }
                }
              }

              return (
            <div key={tr.id} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              {/* Header */}
              <div className="flex items-start justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-xl">
                    {getTransportIcon(tr.type)}
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2 flex-wrap">
                      <span>{tr.provider_name || 'Transporte'}</span>
                      {bookingCodes.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {bookingCodes.map((code) => (
                            <span key={code} className="px-2 py-0.5 bg-brand-50 text-brand-700 border border-brand-200 font-mono text-xs rounded-md">
                              PNR: {code}
                            </span>
                          ))}
                        </div>
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
                    <button
                      onClick={() => openDeleteModal(tr)}
                      className="p-1 text-slate-400 hover:text-red-600 transition-colors cursor-pointer"
                      title="Excluir transporte"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Sender & Linked Document Meta */}
              <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-400">Enviado por:</span>
                  <strong className="font-medium text-slate-700">{tr.uploader_name || tr.uploader_email || 'Manual'}</strong>
                </div>
                {tr.document_id && (
                  <a
                    href={api.documents.viewUrl(tr.document_id)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-purple-700 hover:text-purple-900 font-semibold inline-flex items-center gap-1"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>{tr.document_name || 'Comprovante'}</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>

              {/* Segments */}
              <div className="mt-4 space-y-3">
                {tr.segments && tr.segments.length > 0 ? (
                  tr.segments.map((seg, idx) => {
                    const paxList: Array<{ name: string; seat?: string | null; bookingCode?: string | null }> = Array.isArray(seg.passengers) && seg.passengers.length > 0
                      ? seg.passengers
                      : Array.isArray(seg.passenger_names)
                      ? seg.passenger_names.map((p: any) => typeof p === 'string' ? { name: p } : { name: p.name || p.displayName, seat: p.seat, bookingCode: p.bookingCode })
                      : [];
                    const hasPaxSeats = paxList.some((p) => p.seat);

                    return (
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
                          {paxList.length > 0 && (
                            <div className="mt-1 text-[11px] text-blue-800 bg-blue-50/80 px-2 py-0.5 rounded border border-blue-100/80 inline-flex items-center gap-1.5 flex-wrap">
                              <span className="inline-flex items-center gap-1"><User className="w-3 h-3 text-blue-600" /> Passageiro(s){paxList.length > 1 ? ` (${paxList.length})` : ''}:</span>
                              <strong>
                                {paxList.map((p) => {
                                  const parts: string[] = [];
                                  if (p.seat) parts.push(`Poltrona: ${p.seat}`);
                                  if (p.bookingCode && bookingCodes.length > 1) parts.push(`PNR: ${p.bookingCode}`);
                                  return parts.length > 0 ? `${p.name} (${parts.join(', ')})` : p.name;
                                }).join(' • ')}
                              </strong>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 text-[11px] text-slate-600">
                        {!hasPaxSeats && seg.seat && <span>Assento: <strong>{seg.seat}</strong></span>}
                        {seg.cabin_class && <span className="capitalize">{seg.cabin_class}</span>}
                        {seg.duration_minutes && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-400" />
                            {Math.floor(seg.duration_minutes / 60)}h{seg.duration_minutes % 60}m
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
                ) : (
                  <p className="text-xs text-slate-400 italic">Sem trechos detalhados</p>
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
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 border border-slate-200">
            <h3 className="text-base font-bold text-slate-900 mb-4">Adicionar Reserva de Transporte</h3>
            <form onSubmit={handleCreate} className="space-y-3">
              {addTransportError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                  <span>{addTransportError}</span>
                </div>
              )}
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

      {/* Confirmation Modal for Transport Deletion with Document Option */}
      {deleteModalData && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3 mb-4">
              <div className="p-2.5 bg-red-50 text-red-600 rounded-xl shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Excluir Reserva de Transporte</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Esta ação removerá a reserva de <strong>{deleteModalData.carrier}</strong> da viagem.
                </p>
              </div>
            </div>

            {/* Details Box */}
            <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl space-y-2 text-xs mb-4">
              {deleteModalData.route && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-medium">Trecho:</span>
                  <strong className="text-slate-900">{deleteModalData.route}</strong>
                </div>
              )}
              {deleteModalData.pax && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-medium">Passageiro(s):</span>
                  <strong className="text-slate-900">{deleteModalData.pax}</strong>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Enviado por:</span>
                <span className="text-slate-700">{deleteModalData.uploader}</span>
              </div>
              {deleteModalData.code && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-medium">Código / PNR:</span>
                  <span className="font-mono font-semibold text-slate-900 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                    #{deleteModalData.code}
                  </span>
                </div>
              )}
              {deleteModalData.amount && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-medium">Valor:</span>
                  <strong className="text-brand-700">{deleteModalData.amount}</strong>
                </div>
              )}
            </div>

            {/* Cascading Options */}
            <div className="space-y-3 mb-5">
              {/* Linked Document Cascading Checkbox */}
              {deleteModalData.docId && (
                <label className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50/70 border border-amber-200/80 cursor-pointer select-none">
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

              {/* Linked Expense Cascading Checkbox */}
              {deleteModalData.expenseId && (
                <label className="flex items-start gap-2.5 p-3 rounded-xl bg-emerald-50/70 border border-emerald-200/80 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={deleteExpenseChecked}
                    onChange={(e) => setDeleteExpenseChecked(e.target.checked)}
                    className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 mt-0.5 cursor-pointer"
                  />
                  <div className="text-xs">
                    <span className="font-semibold text-emerald-950 block">
                      Excluir também o lançamento de gasto na aba de Despesas
                    </span>
                    <span className="text-emerald-800 text-[11px] block mt-0.5 truncate max-w-[280px]">
                      {deleteModalData.expenseDesc || 'Despesa associada'} {deleteModalData.expenseAmount ? `(${deleteModalData.expenseCurrency || 'R$'} ${Number(deleteModalData.expenseAmount).toLocaleString('pt-BR')})` : ''}
                    </span>
                  </div>
                </label>
              )}
            </div>

            {deleteError && (
              <div className="p-3 mb-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                <span>{deleteError}</span>
              </div>
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
    </div>
  );
};

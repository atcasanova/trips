import React, { useState, useEffect } from 'react';
import {
  Upload,
  FileText,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  Eye,
  Trash2,
  Loader2,
  ExternalLink,
  ChevronRight,
  Plane,
  Building,
  Ticket,
  Receipt,
  Users,
  UserPlus,
  Plus,
  AlertTriangle,
  MapPin,
  User,
  Check,
  X,
  Music,
  Trophy,
  Calendar,
  Ban,
} from 'lucide-react';
import { DocumentItem, TripTraveler } from '../types/index.js';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';
import { formatDateBr } from '../utils/date.js';

interface DocumentsViewProps {
  tripId: string;
  documents: DocumentItem[];
  travelers?: TripTraveler[];
  onRefresh: () => void;
  canEdit: boolean;
}

const formatCurrencyValue = (amount?: number | string | null, currency?: string | null): string | null => {
  if (amount === undefined || amount === null || amount === '') return null;
  const num = typeof amount === 'number' ? amount : parseFloat(String(amount));
  if (isNaN(num)) return null;
  const curr = (currency || 'BRL').toUpperCase();
  const formattedNum = curr === 'JPY'
    ? Math.round(num).toLocaleString('pt-BR')
    : num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  if (curr === 'BRL') return `R$ ${formattedNum}`;
  if (curr === 'USD') return `US$ ${formattedNum}`;
  if (curr === 'EUR') return `€ ${formattedNum}`;
  if (curr === 'JPY') return `¥ ${formattedNum}`;
  return `${curr} ${formattedNum}`;
};

const getExtractedSummary = (doc: DocumentItem): { text: string; icon: React.ReactNode } | null => {
  if (!doc.extraction) return null;

  const type = doc.extraction.detected_type || '';
  const data = doc.extraction.normalized_data || doc.extraction.raw_extraction?.data || doc.extraction.raw_extraction || {};
  const raw = doc.extraction.raw_extraction || {};

  // 1. HOTEL RESERVATION
  if (type === 'hotel_reservation') {
    const rawName = data.hotelName || data.hotel_name || data.accommodationName || 'hotel';
    const hotelPrefix = /^hotel\b/i.test(rawName) ? 'no ' : 'no hotel ';

    // Calculate number of guests
    let peopleCount = 1;
    if (Array.isArray(data.guests) && data.guests.length > 0) {
      peopleCount = data.guests.length;
    } else if (data.guestNames && typeof data.guestNames === 'string') {
      const parts = data.guestNames.split(',').filter(Boolean);
      if (parts.length > 0) peopleCount = parts.length;
    } else if (data.guestsCount || data.numberOfGuests || data.adults) {
      peopleCount = Number(data.guestsCount || data.numberOfGuests || data.adults) || 1;
    }
    const peopleStr = peopleCount === 1 ? 'para 1 pessoa' : `para ${peopleCount} pessoas`;

    // Dates
    const checkIn = formatDateBr(data.checkInDate || data.check_in_date);
    const checkOut = formatDateBr(data.checkOutDate || data.check_out_date);
    let dateStr = '';
    if (checkIn && checkOut) {
      dateStr = `de ${checkIn} a ${checkOut}`;
    } else if (checkIn) {
      dateStr = `a partir de ${checkIn}`;
    } else if (checkOut) {
      dateStr = `até ${checkOut}`;
    }

    const valueStr = formatCurrencyValue(data.totalAmount ?? data.total_amount, data.currency);

    const parts = [
      `Reserva ${hotelPrefix}${rawName} ${peopleStr}`,
      dateStr,
      valueStr,
    ].filter(Boolean);

    return {
      text: parts.join(', '),
      icon: <Building className="w-3.5 h-3.5 text-purple-600 shrink-0" />,
    };
  }

  // 2. FLIGHT RESERVATION
  if (type === 'flight_reservation') {
    const airline = data.airline || data.airline_name || '';
    const pnr = data.reservationCode || data.bookingReference || data.pnr || '';

    // Passengers
    let pCount = 1;
    if (Array.isArray(data.passengers) && data.passengers.length > 0) {
      pCount = data.passengers.length;
    } else if (data.passengersCount) {
      pCount = Number(data.passengersCount) || 1;
    }
    const peopleStr = pCount === 1 ? 'para 1 pessoa' : `para ${pCount} pessoas`;

    // Segments
    const segments = Array.isArray(data.segments) ? data.segments : [];
    let origin = '';
    let destination = '';
    let dateStr = '';
    let tripKind = '';

    if (segments.length > 0) {
      const seg0 = segments[0];
      const segLast = segments[segments.length - 1];
      origin = seg0.departureCity || seg0.departureAirport || '';
      const lastArr = segLast.arrivalCity || segLast.arrivalAirport || '';

      const isRoundTrip = segments.length > 1 && origin.toLowerCase() === lastArr.toLowerCase();
      if (isRoundTrip) {
        tripKind = '(Ida e Volta) ';
        const intermediate = segments
          .map((s: any) => s.arrivalCity || s.arrivalAirport)
          .filter((c: any) => c && String(c).toLowerCase() !== origin.toLowerCase());
        destination = intermediate.length > 0
          ? intermediate[Math.floor((intermediate.length - 1) / 2)]
          : lastArr;
      } else {
        destination = lastArr;
      }

      const depDate = formatDateBr(seg0.departureDate);
      const lastArrDate = formatDateBr(segLast.arrivalDate || segLast.departureDate);

      if (depDate && lastArrDate && depDate !== lastArrDate) {
        dateStr = `de ${depDate} a ${lastArrDate}`;
      } else if (depDate) {
        dateStr = `em ${depDate}`;
      }
    } else {
      const depDate = formatDateBr(data.departureDate);
      if (depDate) dateStr = `em ${depDate}`;
    }

    const valueStr = formatCurrencyValue(data.totalAmount ?? data.total_amount, data.currency);
    const routeStr = origin && destination ? ` de ${origin} a ${destination}` : '';
    const airlineStr = airline ? ` ${airline}` : '';
    const pnrStr = pnr ? ` (${pnr})` : '';

    const parts = [
      `Voo ${tripKind}${airlineStr}${routeStr} ${peopleStr}`.replace(/\s+/g, ' ').trim(),
      dateStr,
      valueStr,
    ].filter(Boolean);

    return {
      text: `${parts.join(', ')}${pnrStr}`,
      icon: <Plane className="w-3.5 h-3.5 text-blue-600 shrink-0" />,
    };
  }

  // 3. ACTIVITY TICKET
  if (type === 'activity_ticket') {
    const rawTitle = data.title || data.activityName || 'Evento';
    const cleanTitle = rawTitle.replace(/^[🎸⚽🎪🎭🎟️🏎️🏀🎾🍿\s]+/, '').replace(/^Show:\s*/i, '').trim();
    const venue = data.venueName || data.venue || '';

    let pCount = 1;
    if (Array.isArray(data.attendees) && data.attendees.length > 0) {
      pCount = data.attendees.length;
    } else if (data.ticketsCount) {
      pCount = Number(data.ticketsCount) || 1;
    } else if (data.notes && typeof data.notes === 'string') {
      const match = data.notes.match(/(\d+)\s+ingressos?/i);
      if (match) pCount = parseInt(match[1], 10);
    }
    const peopleStr = pCount === 1 ? 'para 1 pessoa' : `para ${pCount} pessoas`;

    const eventDate = formatDateBr(data.eventDate || data.date);
    const startTime = data.startTime ? ` às ${data.startTime}` : '';
    const dateStr = eventDate ? `em ${eventDate}${startTime}` : '';

    const valueStr = formatCurrencyValue(data.totalAmount ?? data.total_amount, data.currency);

    let venuePrep = 'em ';
    if (/^(arena|sala|praça|fundação|pista)\b/i.test(venue)) venuePrep = 'na ';
    else if (/^(estádio|teatro|parque|museu|autódromo|ginásio|espaço|clube)\b/i.test(venue)) venuePrep = 'no ';
    const venueStr = venue ? ` ${venuePrep}${venue}` : '';

    const parts = [
      `Ingresso para ${cleanTitle}${venueStr} ${peopleStr}`,
      dateStr,
      valueStr,
    ].filter(Boolean);

    return {
      text: parts.join(', '),
      icon: <Ticket className="w-3.5 h-3.5 text-emerald-600 shrink-0" />,
    };
  }

  // 4. OTHER TRANSPORT
  if (type === 'transport_other') {
    const transportType = data.transportType || 'Transporte';
    const origin = data.departureCity || data.departureStation || '';
    const destination = data.arrivalCity || data.arrivalStation || '';
    const routeStr = origin && destination ? ` de ${origin} a ${destination}` : '';

    let pCount = 1;
    if (Array.isArray(data.passengers) && data.passengers.length > 0) {
      pCount = data.passengers.length;
    }
    const peopleStr = pCount === 1 ? 'para 1 pessoa' : `para ${pCount} pessoas`;

    const depDate = formatDateBr(data.departureDate || data.date);
    const depTime = data.departureTime ? ` às ${data.departureTime}` : '';
    const dateStr = depDate ? `em ${depDate}${depTime}` : '';

    const valueStr = formatCurrencyValue(data.totalAmount ?? data.total_amount, data.currency);

    const parts = [
      `${transportType}${routeStr} ${peopleStr}`,
      dateStr,
      valueStr,
    ].filter(Boolean);

    return {
      text: parts.join(', '),
      icon: <Plane className="w-3.5 h-3.5 text-indigo-600 shrink-0" />,
    };
  }

  // 5. EXPENSE RECEIPT
  if (type === 'expense_receipt') {
    const merchant = data.merchantName || data.merchant || 'Comprovante';
    const dateStr = formatDateBr(data.date) ? `em ${formatDateBr(data.date)}` : '';
    const valueStr = formatCurrencyValue(data.totalAmount ?? data.total_amount, data.currency);

    const parts = [
      `Recibo em ${merchant}`,
      dateStr,
      valueStr,
    ].filter(Boolean);

    return {
      text: parts.join(', '),
      icon: <Receipt className="w-3.5 h-3.5 text-amber-600 shrink-0" />,
    };
  }

  // 6. FALLBACK / OTHER
  if (raw.summary && typeof raw.summary === 'string' && raw.summary.length > 5) {
    return {
      text: raw.summary,
      icon: <Sparkles className="w-3.5 h-3.5 text-slate-500 shrink-0" />,
    };
  }

  return null;
};

export const DocumentsView: React.FC<DocumentsViewProps> = ({
  tripId,
  documents,
  travelers = [],
  onRefresh,
  canEdit,
}) => {
  const { user: currentUser } = useAuth();
  const [localDocuments, setLocalDocuments] = useState<DocumentItem[]>(documents);

  useEffect(() => {
    setLocalDocuments(documents);
  }, [documents]);

  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<DocumentItem | null>(null);

  // Success toast for feedback
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Review & Confirmation Modal state
  const [reviewModalDoc, setReviewModalDoc] = useState<DocumentItem | null>(null);
  const [confirmedType, setConfirmedType] = useState<string>('flight_reservation');
  const [editDataJson, setEditDataJson] = useState<string>('{}');
  const [savingConfirmation, setSavingConfirmation] = useState(false);

  // Travelers & Detected People state
  const [tripTravelers, setTripTravelers] = useState<TripTraveler[]>(travelers);
  const [showAddPersonDropdown, setShowAddPersonDropdown] = useState(false);
  const [newCompanionInputName, setNewCompanionInputName] = useState('');
  const [detectedPeople, setDetectedPeople] = useState<Array<{
    id: string;
    detectedName: string;
    seat?: string;
    ticketNumber?: string;
    action: 'LINK_USER' | 'LINK_TRAVELER' | 'CREATE_COMPANION' | 'IGNORE';
    targetUserId?: string;
    targetTravelerId?: string;
    newCompanionName?: string;
  }>>([]);

  let currentParsedData: any = {};
  try {
    currentParsedData = editDataJson ? JSON.parse(editDataJson) : {};
  } catch {
    currentParsedData = {};
  }

  const cleanTicketName = (raw: string): string => {
    if (!raw) return '';
    let name = raw.replace(/\b(MR|MRS|MS|MSTR|MISS|DR|PROF)\b/gi, '').trim();
    if (name.includes('/')) {
      const parts = name.split('/').map((p) => p.trim());
      if (parts.length === 2) {
        name = `${parts[1]} ${parts[0]}`;
      }
    }
    return name
      .toLowerCase()
      .split(' ')
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  };

  const wordsOverlap = (a?: string | null, b?: string | null): boolean => {
    if (!a || !b) return false;
    const clean = (s: string) =>
      s
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9 ]/g, ' ')
        .split(' ')
        .filter((w) => w.length > 2);
    const wordsA = clean(a);
    const wordsB = clean(b);
    return wordsA.some((wa) => wordsB.includes(wa));
  };

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    setUploading(true);

    try {
      const res = await api.documents.upload(tripId, file);
      onRefresh();

      // If AI extraction generated, open review modal right away!
      if (res.document && res.document.extraction) {
        await openReviewModal({
          ...res.document,
          extraction: res.document.extraction,
        });
      }
    } catch (err: any) {
      alert(err.message || 'Erro ao enviar documento');
    } finally {
      setUploading(false);
    }
  };

  const openReviewModal = async (doc: DocumentItem) => {
    setReviewModalDoc(doc);
    const type = doc.extraction?.detected_type || 'flight_reservation';
    setConfirmedType(type);

    const initialData = doc.extraction?.normalized_data || doc.extraction?.raw_extraction || {};
    setEditDataJson(JSON.stringify(initialData, null, 2));

    // 1. Fetch current travelers of the trip
    let currentTravelers: TripTraveler[] = [];
    try {
      const res = await api.trips.listTravelers(tripId);
      currentTravelers = res.travelers || [];
      setTripTravelers(currentTravelers);
    } catch (e) {
      console.error('Erro ao carregar viajantes:', e);
    }

    // 2. Extract detected candidates
    const peopleList: Array<{
      id: string;
      detectedName: string;
      seat?: string;
      ticketNumber?: string;
      action: 'LINK_USER' | 'LINK_TRAVELER' | 'CREATE_COMPANION' | 'IGNORE';
      targetUserId?: string;
      targetTravelerId?: string;
      newCompanionName?: string;
    }> = [];

    const addPersonCandidate = (name: string, rawTicketName?: string, seat?: string, ticketNumber?: string) => {
      const raw = (rawTicketName || name || '').trim();
      if (!raw) return;
      if (peopleList.some((p) => p.detectedName.toLowerCase() === raw.toLowerCase())) return;

      const cleanName = cleanTicketName(raw);

      // Smart Matching:
      // A) Does it match the current user?
      if (currentUser && wordsOverlap(raw, currentUser.name)) {
        peopleList.push({
          id: Math.random().toString(36).substring(7),
          detectedName: raw,
          seat,
          ticketNumber,
          action: 'LINK_USER',
          targetUserId: currentUser.id,
          newCompanionName: cleanName,
        });
        return;
      }

      // B) Does it match any existing trip traveler?
      const matchedTraveler = currentTravelers.find(
        (t) => wordsOverlap(raw, t.display_name) || (t.ticket_name && wordsOverlap(raw, t.ticket_name))
      );
      if (matchedTraveler) {
        peopleList.push({
          id: Math.random().toString(36).substring(7),
          detectedName: raw,
          seat,
          ticketNumber,
          action: matchedTraveler.user_id ? 'LINK_USER' : 'LINK_TRAVELER',
          targetUserId: matchedTraveler.user_id || undefined,
          targetTravelerId: matchedTraveler.id,
          newCompanionName: matchedTraveler.display_name,
        });
        return;
      }

      // C) Otherwise suggest creating new companion
      peopleList.push({
        id: Math.random().toString(36).substring(7),
        detectedName: raw,
        seat,
        ticketNumber,
        action: 'CREATE_COMPANION',
        newCompanionName: cleanName,
      });
    };

    // Extract from flight passengers
    if (Array.isArray(initialData.passengers)) {
      initialData.passengers.forEach((p: any) => {
        if (typeof p === 'object' && p !== null) {
          addPersonCandidate(p.name, p.rawTicketName, p.seat, p.ticketNumber);
        } else if (typeof p === 'string') {
          addPersonCandidate(p);
        }
      });
    }

    // Extract from hotel guests
    if (Array.isArray(initialData.guests)) {
      initialData.guests.forEach((g: any) => {
        if (typeof g === 'object' && g !== null) {
          addPersonCandidate(g.name, g.rawName);
        } else if (typeof g === 'string') {
          addPersonCandidate(g);
        }
      });
    }

    if (typeof initialData.guestNames === 'string' && initialData.guestNames.trim()) {
      initialData.guestNames.split(/[,;\n]/).forEach((n: string) => {
        if (n.trim()) addPersonCandidate(n.trim());
      });
    }

    if (initialData.attendeeName) {
      addPersonCandidate(initialData.attendeeName);
    }

    if (Array.isArray(initialData.attendees)) {
      initialData.attendees.forEach((a: any) => {
        if (typeof a === 'object' && a !== null) {
          addPersonCandidate(a.name, a.name, a.seat, a.ticketCode);
        } else if (typeof a === 'string') {
          addPersonCandidate(a);
        }
      });
    }

    // If none detected, add default candidate for current user
    if (peopleList.length === 0 && currentUser) {
      peopleList.push({
        id: Math.random().toString(36).substring(7),
        detectedName: currentUser.name,
        action: 'LINK_USER',
        targetUserId: currentUser.id,
        newCompanionName: currentUser.name,
      });
    }

    setDetectedPeople(peopleList);
  };

  const handlePersonActionChange = (index: number, val: string) => {
    setDetectedPeople((prev) => {
      const copy = [...prev];
      const person = { ...copy[index] };

      if (val.startsWith('USER:')) {
        person.action = 'LINK_USER';
        person.targetUserId = val.replace('USER:', '');
        person.targetTravelerId = undefined;
      } else if (val.startsWith('TRAVELER:')) {
        person.action = 'LINK_TRAVELER';
        person.targetTravelerId = val.replace('TRAVELER:', '');
        person.targetUserId = undefined;
      } else if (val === 'CREATE_COMPANION') {
        person.action = 'CREATE_COMPANION';
        person.targetUserId = undefined;
        person.targetTravelerId = undefined;
        if (!person.newCompanionName) {
          person.newCompanionName = cleanTicketName(person.detectedName);
        }
      } else if (val === 'IGNORE') {
        person.action = 'IGNORE';
      }

      copy[index] = person;
      return copy;
    });
  };

  const updateCompanionName = (index: number, name: string) => {
    setDetectedPeople((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], newCompanionName: name };
      return copy;
    });
  };

  const handleAddExistingTraveler = (traveler: TripTraveler) => {
    const isUser = Boolean(traveler.user_id);
    const alreadyIn = detectedPeople.some(
      (p) =>
        (p.targetTravelerId && p.targetTravelerId === traveler.id) ||
        (p.targetUserId && traveler.user_id && p.targetUserId === traveler.user_id) ||
        p.detectedName.toLowerCase() === traveler.display_name.toLowerCase()
    );
    if (alreadyIn) return;

    setDetectedPeople((prev) => [
      ...prev,
      {
        id: Math.random().toString(36).substring(7),
        detectedName: traveler.display_name,
        action: isUser ? 'LINK_USER' : 'LINK_TRAVELER',
        targetUserId: traveler.user_id || undefined,
        targetTravelerId: traveler.id,
        newCompanionName: traveler.display_name,
      },
    ]);
    setShowAddPersonDropdown(false);
  };

  const handleAddNewCompanion = (name: string) => {
    const clean = name.trim();
    if (!clean) return;
    setDetectedPeople((prev) => [
      ...prev,
      {
        id: Math.random().toString(36).substring(7),
        detectedName: clean,
        action: 'CREATE_COMPANION',
        newCompanionName: clean,
      },
    ]);
    setNewCompanionInputName('');
    setShowAddPersonDropdown(false);
  };

  const addManualPerson = () => {
    setDetectedPeople((prev) => [
      ...prev,
      {
        id: Math.random().toString(36).substring(7),
        detectedName: 'Novo Passageiro',
        action: 'CREATE_COMPANION',
        newCompanionName: 'Novo Acompanhante',
      },
    ]);
  };

  const removePerson = (index: number) => {
    setDetectedPeople((prev) => prev.filter((_, i) => i !== index));
  };

  const handleConfirmExtraction = async () => {
    if (!reviewModalDoc) return;
    setSavingConfirmation(true);

    try {
      let parsedData: any = {};
      try {
        parsedData = JSON.parse(editDataJson);
      } catch (e) {
        alert('JSON inválido nos dados editados');
        setSavingConfirmation(false);
        return;
      }

      // Synchronize confirmed traveler associations into parsedData before sending!
      const activeTravelers = detectedPeople.filter((p) => p.action !== 'IGNORE');
      if (activeTravelers.length > 0) {
        const activeNames = activeTravelers.map((p) => p.newCompanionName || p.detectedName);
        if (confirmedType === 'hotel_reservation') {
          parsedData.guestNames = activeNames.join(', ');
          parsedData.guests = activeNames.map((n) => ({ name: n }));
          parsedData.guestsCount = activeNames.length;
        } else if (confirmedType === 'flight_reservation') {
          parsedData.passengers = activeTravelers.map((p) => ({
            name: p.newCompanionName || p.detectedName,
            seat: p.seat || null,
            ticketNumber: p.ticketNumber || null,
          }));
          parsedData.passengersCount = activeTravelers.length;
        } else if (confirmedType === 'activity_ticket') {
          parsedData.attendees = activeNames.map((n) => ({ name: n }));
          parsedData.ticketsCount = activeNames.length;
        }
      }

      await api.documents.confirmExtraction(tripId, reviewModalDoc.id, {
        confirmedType,
        normalizedData: parsedData,
        userCorrections: parsedData,
        travelerAssociations: detectedPeople,
      });

      setReviewModalDoc(null);
      setSuccessToast('Reserva e participantes confirmados com sucesso na viagem!');
      setTimeout(() => setSuccessToast(null), 4000);
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Erro ao confirmar extração');
    } finally {
      setSavingConfirmation(false);
    }
  };

  const handleDelete = async (docId: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este documento?')) return;
    const prev = localDocuments;
    setLocalDocuments((current) => current.filter((d) => d.id !== docId));
    try {
      await api.documents.delete(tripId, docId);
      if (selectedDoc?.id === docId) setSelectedDoc(null);
      onRefresh();
    } catch (err: any) {
      setLocalDocuments(prev);
      alert(err.message || 'Erro ao excluir documento');
    }
  };

  const [reprocessingId, setReprocessingId] = useState<string | null>(null);

  const handleReprocess = async (docId: string) => {
    try {
      setReprocessingId(docId);
      const res = await api.documents.reprocess(tripId, docId);
      onRefresh();
      if (res.document?.extraction) {
        openReviewModal(res.document);
      } else {
        alert('Documento reprocessado com sucesso!');
      }
    } catch (err: any) {
      alert(err.message || 'Erro ao reprocessar documento');
    } finally {
      setReprocessingId(null);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'FLIGHT':
        return <Plane className="w-4 h-4 text-sky-600" />;
      case 'HOTEL':
        return <Building className="w-4 h-4 text-emerald-600" />;
      case 'TICKET':
        return <Ticket className="w-4 h-4 text-amber-600" />;
      case 'RECEIPT':
        return <Receipt className="w-4 h-4 text-purple-600" />;
      default:
        return <FileText className="w-4 h-4 text-slate-500" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Success Notification */}
      {successToast && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center justify-between shadow-2xs animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successToast}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessToast(null)}
            className="text-emerald-600 hover:text-emerald-800 p-1 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Upload Drag & Drop Zone */}
      {canEdit && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            handleFileUpload(e.dataTransfer.files);
          }}
          className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all ${
            dragOver
              ? 'border-brand-500 bg-brand-50/60 scale-[1.01]'
              : 'border-slate-300 hover:border-slate-400 bg-white'
          }`}
        >
          <input
            type="file"
            id="file-upload"
            className="hidden"
            accept=".pdf,.png,.jpg,.jpeg,.webp,.docx"
            onChange={(e) => handleFileUpload(e.target.files)}
          />

          <div className="max-w-md mx-auto flex flex-col items-center">
            {uploading ? (
              <div className="py-4 flex flex-col items-center gap-3">
                <Loader2 className="w-10 h-10 text-brand-600 animate-spin" />
                <p className="text-sm font-semibold text-slate-800">
                  Enviando arquivo & interpretando dados com OpenAI...
                </p>
                <p className="text-xs text-slate-500">
                  Identificando eventos, shows, jogos, passagens aéreas e hotéis com busca web de coordenadas...
                </p>
              </div>
            ) : (
              <>
                <div className="w-14 h-14 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center mb-3 shadow-inner">
                  <Upload className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-slate-900">Arraste seu documento ou comprovante aqui</h3>
                <p className="text-xs text-slate-500 mt-1 mb-4">
                  Suporte para PDF, JPG, PNG e impressões de e-mail (shows, jogos, ingressos, passagens e hotéis)
                </p>
                <label
                  htmlFor="file-upload"
                  className="px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-semibold shadow-sm cursor-pointer transition-colors"
                >
                  Selecionar do Computador
                </label>
              </>
            )}
          </div>
        </div>
      )}

      {/* Documents List */}
      <div>
        <h3 className="text-base font-bold text-slate-900 mb-3 flex items-center gap-2">
          <FileText className="w-4 h-4 text-brand-600" />
          Documentos Armazenados ({localDocuments.length})
        </h3>

        {localDocuments.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-400 text-xs">
            Nenhum documento anexado a esta viagem até o momento.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {localDocuments.map((doc) => {
              const hasExtraction = Boolean(doc.extraction);
              const isConfirmed = doc.extraction?.status === 'CONFIRMED';
              const summary = getExtractedSummary(doc);

              return (
                <div
                  key={doc.id}
                  className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between"
                >
                  <div>
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <div className="p-2 rounded-xl bg-slate-50 border border-slate-100">
                          {getCategoryIcon(doc.category)}
                        </div>
                        <div>
                          <h4 className="font-semibold text-xs text-slate-900 truncate max-w-[180px]" title={doc.original_name}>
                            {doc.original_name}
                          </h4>
                          <span className="text-[10px] text-slate-400 block">{formatFileSize(doc.file_size)}</span>
                        </div>
                      </div>

                      {/* AI Status Badge */}
                      {doc.ai_status === 'COMPLETED' ? (
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold flex items-center gap-1 ${
                            isConfirmed ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          <Sparkles className="w-2.5 h-2.5" />
                          {isConfirmed ? 'Confirmado' : 'Revisar IA'}
                        </span>
                      ) : doc.ai_status === 'PROCESSING' ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-800 flex items-center gap-1">
                          <Loader2 className="w-2.5 h-2.5 animate-spin" /> Processando
                        </span>
                      ) : doc.ai_status === 'FAILED' ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-700 flex items-center gap-1">
                          <AlertTriangle className="w-2.5 h-2.5" /> Leitura Pendente
                        </span>
                      ) : null}
                    </div>

                    {/* AI summary snippet */}
                    {doc.extraction?.raw_extraction?.summary &&
                      doc.extraction.raw_extraction.summary !== summary?.text && (
                      <p className="text-[11px] text-slate-600 bg-slate-50 p-2 rounded-lg my-2 line-clamp-2">
                        {doc.extraction.raw_extraction.summary}
                      </p>
                    )}

                    {/* Resumo estruturado das informações extraídas */}
                    {summary && (
                      <div className="mt-2.5 p-2.5 rounded-xl bg-purple-50/70 border border-purple-100/90 text-slate-800 text-xs flex items-start gap-2 shadow-2xs">
                        <span className="p-1 rounded-lg bg-white border border-purple-200 shrink-0 mt-0.5 shadow-2xs">
                          {summary.icon}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-slate-900 leading-snug">
                            {summary.text}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="pt-3 mt-2 border-t border-slate-100 flex items-center justify-between">
                    <a
                      href={api.documents.viewUrl(doc.id)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-semibold text-slate-600 hover:text-brand-600 flex items-center gap-1"
                    >
                      <Eye className="w-3.5 h-3.5" /> Visualizar
                    </a>

                    <div className="flex items-center gap-1">
                      {hasExtraction && canEdit && (
                        <button
                          onClick={() => openReviewModal(doc)}
                          className="px-2.5 py-1 bg-brand-50 hover:bg-brand-100 text-brand-700 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1"
                        >
                          <Sparkles className="w-3 h-3 text-amber-500" />
                          {isConfirmed ? 'Editar Dados' : 'Revisar Extração'}
                        </button>
                      )}

                      {!hasExtraction && canEdit && (
                        <button
                          onClick={() => handleReprocess(doc.id)}
                          disabled={reprocessingId === doc.id}
                          className="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 disabled:opacity-50 cursor-pointer"
                          title="Analisar documento com inteligência artificial"
                        >
                          {reprocessingId === doc.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Sparkles className="w-3 h-3 text-purple-600" />
                          )}
                          {reprocessingId === doc.id ? 'Lendo...' : 'Ler com IA'}
                        </button>
                      )}

                      {canEdit && (
                        <button
                          onClick={() => handleDelete(doc.id)}
                          className="p-1 text-slate-400 hover:text-red-600 rounded-lg"
                          title="Excluir documento"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* SPLIT SCREEN REVIEW MODAL (Left: Structured Data, Right: Original Document View) */}
      {reviewModalDoc && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full h-[90vh] flex flex-col overflow-hidden border border-slate-200">
            {/* Modal Header */}
            <div className="px-6 py-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-500" />
                <h3 className="font-bold text-sm sm:text-base text-slate-900">
                  Revisão de Dados Extraídos por IA — {reviewModalDoc.original_name}
                </h3>
              </div>
              <button
                onClick={() => setReviewModalDoc(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Split Content: Left = Structured Form, Right = Embedded Viewer */}
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 overflow-hidden">
              {/* LADO ESQUERDO: Dados Estruturados da Passagem / Hotel / Atividade */}
              <div className="p-6 overflow-y-auto flex flex-col justify-between bg-white">
                <div>
                  <div className="mb-4">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Tipo de Reserva Identificado
                    </label>
                    <select
                      value={confirmedType}
                      onChange={(e) => setConfirmedType(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-brand-500 bg-white font-medium text-slate-800"
                    >
                      <option value="flight_reservation">Passagem Aérea / Bilhete de Voo</option>
                      <option value="hotel_reservation">Reserva de Hotel / Hospedagem</option>
                      <option value="activity_ticket">Ingresso / Atração / Evento</option>
                      <option value="expense_receipt">Recibo de Despesa / Comprovante</option>
                      <option value="other">Outro Documento</option>
                    </select>
                  </div>

                  {/* EVENT PREVIEW CARD (When confirmedType === 'activity_ticket') */}
                  {confirmedType === 'activity_ticket' && (
                    <div className="mb-5 p-4 bg-gradient-to-br from-amber-50 to-orange-50/60 border border-amber-200/80 rounded-2xl shadow-xs">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                            {currentParsedData.eventType === 'CONCERT' || currentParsedData.artistOrPerformer ? (
                              <Music className="w-5 h-5 text-amber-700" />
                            ) : currentParsedData.eventType === 'SPORTS_MATCH' || currentParsedData.teams ? (
                              <Trophy className="w-5 h-5 text-amber-700" />
                            ) : currentParsedData.eventType === 'THEATER_SHOW' ? (
                              <Ticket className="w-5 h-5 text-amber-700" />
                            ) : currentParsedData.eventType === 'FESTIVAL' ? (
                              <Sparkles className="w-5 h-5 text-amber-700" />
                            ) : (
                              <Ticket className="w-5 h-5 text-amber-700" />
                            )}
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-slate-900 leading-snug">
                              {currentParsedData.title || currentParsedData.activityName || 'Evento Identificado'}
                            </h4>
                            <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider">
                              {currentParsedData.eventType === 'CONCERT' ? 'Show / Apresentação Musical' :
                               currentParsedData.eventType === 'SPORTS_MATCH' ? 'Partida Esportiva' :
                               currentParsedData.eventType === 'THEATER_SHOW' ? 'Espetáculo Teatral' :
                               currentParsedData.eventType === 'FESTIVAL' ? 'Festival' :
                               'Ingresso / Atração'}
                            </span>
                          </div>
                        </div>
                        {currentParsedData.latitude && currentParsedData.longitude ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            <MapPin className="w-3 h-3 text-emerald-600" />
                            GPS Localizado
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                            <MapPin className="w-3 h-3 text-slate-400" />
                            Geocodificação Automática
                          </span>
                        )}
                      </div>

                      {/* Event details grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-700 bg-white/90 p-3 rounded-xl border border-amber-100 mb-3">
                        {(currentParsedData.artistOrPerformer || currentParsedData.teams) && (
                          <div>
                            <span className="text-[10px] font-bold text-slate-400 uppercase block">Atração / Partida</span>
                            <p className="font-semibold text-slate-800">
                              {currentParsedData.artistOrPerformer ||
                               (currentParsedData.teams ? `${currentParsedData.teams.homeTeam || ''} x ${currentParsedData.teams.awayTeam || ''}` : '')}
                              {currentParsedData.competition ? ` (${currentParsedData.competition})` : ''}
                            </p>
                          </div>
                        )}

                        {(currentParsedData.venueName || currentParsedData.city) && (
                          <div>
                            <span className="text-[10px] font-bold text-slate-400 uppercase block">Local / Estádio / Arena</span>
                            <p className="font-semibold text-slate-800">
                              {currentParsedData.venueName || 'Local não informado'}
                              {currentParsedData.city ? ` — ${currentParsedData.city}` : ''}
                            </p>
                          </div>
                        )}

                        {currentParsedData.eventDate && (
                          <div>
                            <span className="text-[10px] font-bold text-slate-400 uppercase block">Data e Horário</span>
                            <p className="font-semibold text-slate-800 flex items-center gap-1">
                              <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span>
                                {currentParsedData.eventDate}
                                {currentParsedData.startTime ? ` às ${currentParsedData.startTime}` : ''}
                                {currentParsedData.doorsOpenTime ? ` (Portões: ${currentParsedData.doorsOpenTime})` : ''}
                              </span>
                            </p>
                          </div>
                        )}

                        {(currentParsedData.sector || currentParsedData.gate || currentParsedData.seat) && (
                          <div>
                            <span className="text-[10px] font-bold text-slate-400 uppercase block">Acesso e Assentos</span>
                            <p className="font-semibold text-slate-800">
                              {[
                                currentParsedData.sector ? `Setor: ${currentParsedData.sector}` : '',
                                currentParsedData.gate ? `Portão: ${currentParsedData.gate}` : '',
                                currentParsedData.seat ? `Assento: ${currentParsedData.seat}` : '',
                              ].filter(Boolean).join(' | ')}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Location coordinates line */}
                      {currentParsedData.address && (
                        <div className="flex items-start gap-1.5 text-xs text-slate-600 mb-2">
                          <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-medium">{currentParsedData.address}</span>
                            {currentParsedData.latitude && currentParsedData.longitude && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-mono text-emerald-700 ml-2 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                                <MapPin className="w-3 h-3 text-emerald-600" /> Lat: {Number(currentParsedData.latitude).toFixed(4)}, Lng: {Number(currentParsedData.longitude).toFixed(4)}
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Instructions / notice */}
                      <div className="text-[11px] text-amber-900/90 bg-amber-100/70 p-2.5 rounded-lg flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>
                          Ao confirmar, este evento será programado automaticamente no dia correspondente do <strong>Roteiro</strong>, com marcador cartográfico no mapa e despesa registrada.
                        </span>
                      </div>
                    </div>
                  )}

                  {/* PASSAGEIROS E ACOMPANHANTES DETECTADOS */}
                  <div className="mb-5 p-4 bg-purple-50/70 border border-purple-200/80 rounded-2xl">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5">
                        <Users className="w-4 h-4 text-purple-700" />
                        <h4 className="text-xs font-bold text-purple-950 uppercase tracking-wider">
                          Pessoas / Participantes no Documento ({detectedPeople.length})
                        </h4>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowAddPersonDropdown((prev) => !prev)}
                        className="text-[11px] font-semibold text-purple-700 hover:text-purple-900 bg-white hover:bg-purple-100 border border-purple-200 px-2.5 py-1 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                      >
                        <Plus className="w-3.5 h-3.5" /> Adicionar Participante
                      </button>
                    </div>

                    <p className="text-[11px] text-purple-900/80 mb-3 leading-relaxed">
                      A IA identificou os passageiros/hóspedes abaixo. Você pode associar cada um a um usuário da viagem, selecionar um acompanhante já cadastrado ou criar um novo acompanhante.
                    </p>

                    {/* Popover / Participant Picker */}
                    {showAddPersonDropdown && (
                      <div className="mb-3 p-3 bg-white border border-purple-200 rounded-xl shadow-xs space-y-2.5 animate-in fade-in duration-150">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                            <UserPlus className="w-3.5 h-3.5 text-purple-600" />
                            Vincular Participante da Viagem
                          </span>
                          <button
                            type="button"
                            onClick={() => setShowAddPersonDropdown(false)}
                            className="text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {tripTravelers.length > 0 && (
                          <div>
                            <span className="text-[11px] text-slate-500 block mb-1">Participantes cadastrados:</span>
                            <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto">
                              {tripTravelers.map((t) => {
                                const alreadyLinked = detectedPeople.some(
                                  (p) =>
                                    (p.targetTravelerId && p.targetTravelerId === t.id) ||
                                    (p.targetUserId && t.user_id && p.targetUserId === t.user_id) ||
                                    p.detectedName.toLowerCase() === t.display_name.toLowerCase()
                                );

                                return (
                                  <button
                                    key={t.id}
                                    type="button"
                                    disabled={alreadyLinked}
                                    onClick={() => handleAddExistingTraveler(t)}
                                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                                      alreadyLinked
                                        ? 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed'
                                        : 'bg-white hover:bg-purple-50 border-slate-200 hover:border-purple-300 text-slate-800'
                                    }`}
                                  >
                                    <User className="w-3 h-3 text-slate-400" />
                                    <span>{t.display_name}</span>
                                    {alreadyLinked ? (
                                      <Check className="w-3 h-3 text-emerald-600" />
                                    ) : (
                                      <Plus className="w-3 h-3 text-purple-600" />
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        <div className="pt-2 border-t border-slate-100 flex items-center gap-1.5">
                          <input
                            type="text"
                            value={newCompanionInputName}
                            onChange={(e) => setNewCompanionInputName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddNewCompanion(newCompanionInputName);
                              }
                            }}
                            placeholder="Ou digite o nome de um novo acompanhante..."
                            className="flex-1 px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:outline-none"
                          />
                          <button
                            type="button"
                            disabled={!newCompanionInputName.trim()}
                            onClick={() => handleAddNewCompanion(newCompanionInputName)}
                            className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold cursor-pointer transition-colors"
                          >
                            Adicionar
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="space-y-3">
                      {detectedPeople.map((person, idx) => (
                        <div key={person.id} className="p-3 bg-white border border-purple-100 rounded-xl shadow-xs">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-bold text-slate-800 font-mono bg-slate-100 px-2 py-0.5 rounded border border-slate-200 flex items-center gap-1">
                                <User className="w-3 h-3 text-slate-500" />
                                {person.detectedName}
                              </span>
                              {person.seat && (
                                <span className="text-[10px] bg-purple-100 text-purple-800 font-semibold px-1.5 py-0.5 rounded">
                                  Assento {person.seat}
                                </span>
                              )}
                              {person.ticketNumber && (
                                <span className="text-[10px] bg-slate-100 text-slate-600 font-mono px-1.5 py-0.5 rounded">
                                  Bilhete {person.ticketNumber}
                                </span>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => removePerson(idx)}
                              className="text-slate-400 hover:text-red-500 text-xs p-1 cursor-pointer"
                              title="Remover pessoa"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                            <div>
                              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                Vincular a quem:
                              </label>
                              <select
                                value={
                                  person.action === 'LINK_USER' && person.targetUserId
                                    ? `USER:${person.targetUserId}`
                                    : person.action === 'LINK_TRAVELER' && person.targetTravelerId
                                    ? `TRAVELER:${person.targetTravelerId}`
                                    : person.action === 'CREATE_COMPANION'
                                    ? 'CREATE_COMPANION'
                                    : 'IGNORE'
                                }
                                onChange={(e) => handlePersonActionChange(idx, e.target.value)}
                                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-medium text-slate-800 focus:bg-white focus:ring-2 focus:ring-purple-500"
                              >
                                <optgroup label="Usuário Atual (Você)">
                                  {currentUser && (
                                    <option value={`USER:${currentUser.id}`}>
                                      Eu ({currentUser.name})
                                    </option>
                                  )}
                                </optgroup>
                                {tripTravelers.some((t) => t.is_registered_user && t.user_id !== currentUser?.id) && (
                                  <optgroup label="Outros Usuários Registrados">
                                    {tripTravelers
                                      .filter((t) => t.is_registered_user && t.user_id !== currentUser?.id)
                                      .map((t) => (
                                        <option key={t.id} value={`USER:${t.user_id}`}>
                                          {t.display_name} {t.email ? `(${t.email})` : ''}
                                        </option>
                                      ))}
                                  </optgroup>
                                )}
                                {tripTravelers.some((t) => !t.is_registered_user) && (
                                  <optgroup label="Acompanhantes Já Cadastrados">
                                    {tripTravelers
                                      .filter((t) => !t.is_registered_user)
                                      .map((t) => (
                                        <option key={t.id} value={`TRAVELER:${t.id}`}>
                                          {t.display_name} (Acompanhante)
                                        </option>
                                      ))}
                                  </optgroup>
                                )}
                                <optgroup label="Ações">
                                  <option value="CREATE_COMPANION">Cadastrar Novo Acompanhante na Viagem</option>
                                  <option value="IGNORE">Não vincular a viajante</option>
                                </optgroup>
                              </select>
                            </div>

                            {person.action === 'CREATE_COMPANION' && (
                              <div>
                                <label className="block text-[11px] font-semibold text-purple-900 mb-1">
                                  Nome de Exibição do Acompanhante:
                                </label>
                                <input
                                  type="text"
                                  required
                                  value={person.newCompanionName || ''}
                                  onChange={(e) => updateCompanionName(idx, e.target.value)}
                                  placeholder="Ex: Mariana Costa"
                                  className="w-full px-2.5 py-1.5 bg-purple-50/50 border border-purple-300 rounded-lg text-xs font-semibold text-purple-950 focus:bg-white focus:ring-2 focus:ring-purple-500"
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                        Campos Estruturados Extraídos (JSON Editável)
                      </label>
                      <span className="text-[11px] text-slate-400">Modelo: {reviewModalDoc.extraction?.model_used || 'GPT-4o'}</span>
                    </div>
                    <textarea
                      rows={14}
                      value={editDataJson}
                      onChange={(e) => setEditDataJson(e.target.value)}
                      className="w-full p-3 font-mono text-xs border border-slate-300 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-brand-500 focus:outline-none"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">
                      Você pode ajustar códigos PNR, números de voo, datas e horários antes de confirmar.
                    </p>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setReviewModalDoc(null)}
                    className="px-4 py-2 border border-slate-300 text-xs font-semibold text-slate-700 rounded-xl hover:bg-slate-50"
                  >
                    Fechar sem Salvar
                  </button>
                  <button
                    type="button"
                    disabled={savingConfirmation}
                    onClick={handleConfirmExtraction}
                    className="px-5 py-2.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-sm transition-colors flex items-center gap-2"
                  >
                    {savingConfirmation ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    {confirmedType === 'activity_ticket' ? 'Confirmar e Adicionar ao Roteiro' : 'Confirmar e Gravar Reserva'}
                  </button>
                </div>
              </div>

              {/* LADO DIREITO: Visualizador do Documento Original (PDF ou Imagem) */}
              <div className="h-full bg-slate-100 overflow-hidden flex flex-col">
                <div className="px-4 py-2 bg-slate-200/80 border-b border-slate-300 flex items-center justify-between text-xs text-slate-700">
                  <span className="font-semibold">Arquivo Original</span>
                  <a
                    href={api.documents.viewUrl(reviewModalDoc.id)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-brand-600 hover:underline flex items-center gap-1 font-medium"
                  >
                    Abrir em Nova Aba <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                <div className="flex-1 w-full h-full overflow-auto p-2 flex items-center justify-center">
                  {reviewModalDoc.mime_type.startsWith('image/') ? (
                    <img
                      src={api.documents.viewUrl(reviewModalDoc.id)}
                      alt={reviewModalDoc.original_name}
                      className="max-w-full max-h-full object-contain rounded-lg shadow-md"
                    />
                  ) : reviewModalDoc.mime_type === 'application/pdf' ? (
                    <iframe
                      src={api.documents.viewUrl(reviewModalDoc.id)}
                      title={reviewModalDoc.original_name}
                      className="w-full h-full border-0 rounded-lg shadow-inner bg-white"
                    />
                  ) : (
                    <div className="p-8 text-center text-slate-500 text-xs">
                      <FileText className="w-12 h-12 text-slate-300 mx-auto mb-2" />
                      <p>Prévia não disponível diretamente para este tipo de arquivo.</p>
                      <a
                        href={api.documents.viewUrl(reviewModalDoc.id)}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-block text-brand-600 font-semibold underline"
                      >
                        Baixar Arquivo
                      </a>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

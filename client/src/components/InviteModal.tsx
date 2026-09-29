import React, { useState, useEffect } from 'react';
import {
  X,
  UserPlus,
  Mail,
  User as UserIcon,
  Copy,
  Check,
  Plane,
  AlertCircle,
  CheckCircle2,
  Clock,
  Trash2,
  ExternalLink,
  ShieldAlert,
} from 'lucide-react';
import { api } from '../api/client.js';
import { Trip, UserInvitation } from '../types/index.js';

interface InviteModalProps {
  onClose: () => void;
  defaultTripId?: string;
}

export const InviteModal: React.FC<InviteModalProps> = ({ onClose, defaultTripId }) => {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [selectedTripId, setSelectedTripId] = useState<string>(defaultTripId || '');
  const [role, setRole] = useState<'VIEWER' | 'EDITOR' | 'OWNER'>('VIEWER');
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loadingTrips, setLoadingTrips] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [generatedInviteLink, setGeneratedInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // List of pending invitations for the selected trip (if any)
  const [pendingInvites, setPendingInvites] = useState<UserInvitation[]>([]);
  const [loadingInvites, setLoadingInvites] = useState(false);

  useEffect(() => {
    setLoadingTrips(true);
    api.trips
      .list()
      .then((data) => {
        setTrips(data.trips || []);
      })
      .catch((err) => console.error('Erro ao listar viagens:', err))
      .finally(() => setLoadingTrips(false));
  }, []);

  const loadPendingInvites = async (tripId: string) => {
    if (!tripId) {
      setPendingInvites([]);
      return;
    }
    try {
      setLoadingInvites(true);
      const res = await api.invites.listTrip(tripId);
      setPendingInvites(res.invitations || []);
    } catch (err) {
      console.error('Erro ao carregar convites da viagem:', err);
    } finally {
      setLoadingInvites(false);
    }
  };

  useEffect(() => {
    if (selectedTripId) {
      loadPendingInvites(selectedTripId);
    } else {
      setPendingInvites([]);
    }
  }, [selectedTripId]);

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setGeneratedInviteLink(null);
    setCopied(false);
    setSubmitting(true);

    try {
      const res = await api.invites.create({
        email: email.trim(),
        name: name.trim() || undefined,
        tripId: selectedTripId || undefined,
        tripRole: role,
      });

      if (res.alreadyRegistered) {
        setSuccessMsg(res.message);
      } else {
        setSuccessMsg(res.message || 'Convite gerado com sucesso!');
        if (res.inviteLink) {
          setGeneratedInviteLink(res.inviteLink);
        }
      }

      setEmail('');
      setName('');

      if (selectedTripId) {
        await loadPendingInvites(selectedTripId);
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao enviar convite');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyLink = (linkToCopy: string) => {
    navigator.clipboard.writeText(linkToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleRevokeInvite = async (inviteId: string) => {
    if (!window.confirm('Tem certeza que deseja cancelar este convite?')) return;
    try {
      await api.invites.revoke(inviteId);
      if (selectedTripId) {
        await loadPendingInvites(selectedTripId);
      }
    } catch (err: any) {
      alert(err.message || 'Erro ao cancelar convite');
    }
  };

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-brand-600 text-white flex items-center justify-center shadow-sm">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Convidar Novo Usuário</h2>
              <p className="text-[11px] text-slate-500">
                O convidado receberá um link único para definir sua própria senha
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Link gerado com destaque para cópia imediata */}
          {generatedInviteLink && (
            <div className="p-4 bg-brand-50/70 border border-brand-200 rounded-2xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-brand-900 flex items-center gap-1.5">
                  <ExternalLink className="w-3.5 h-3.5 text-brand-600" />
                  Link Único de Convite Gerado:
                </span>
                <span className="text-[10px] text-brand-600 font-medium">Válido por 7 dias</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={generatedInviteLink}
                  className="flex-1 px-3 py-2 text-xs bg-white border border-brand-200 rounded-xl text-slate-700 font-mono select-all focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => handleCopyLink(generatedInviteLink)}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                    copied
                      ? 'bg-emerald-600 text-white'
                      : 'bg-brand-600 hover:bg-brand-700 text-white shadow-xs'
                  }`}
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5" /> Copiado!
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" /> Copiar
                    </>
                  )}
                </button>
              </div>
              <p className="text-[11px] text-slate-500">
                Você pode enviar esse link diretamente pelo WhatsApp ou chat. Ao abrir, o convidado definirá sua própria senha pessoal e já terá acesso imediato.
              </p>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSendInvite} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                E-mail do Convidado <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="amigo@exemplo.com"
                  className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-brand-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nome (Opcional)
              </label>
              <div className="relative">
                <UserIcon className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Carlos Oliveira"
                  className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-brand-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Vincular a uma Viagem
                </label>
                <select
                  value={selectedTripId}
                  onChange={(e) => setSelectedTripId(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-brand-500 focus:outline-none"
                >
                  <option value="">Apenas Acesso Geral ao Trips</option>
                  {trips.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </select>
              </div>

              {selectedTripId && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Permissão na Viagem
                  </label>
                  <select
                    value={role}
                    onChange={(e: any) => setRole(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-brand-500 focus:outline-none"
                  >
                    <option value="VIEWER">Visualizador (apenas consulta)</option>
                    <option value="EDITOR">Editor (pode editar roteiro e despesas)</option>
                    <option value="OWNER">Co-organizador (controle total)</option>
                  </select>
                </div>
              )}
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 px-4 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md shadow-brand-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
              >
                <UserPlus className="w-4 h-4" />
                {submitting ? 'Gerando convite...' : 'Gerar e Enviar Convite'}
              </button>
            </div>
          </form>

          {/* Convites pendentes da viagem selecionada */}
          {selectedTripId && pendingInvites.length > 0 && (
            <div className="pt-3 border-t border-slate-100">
              <h4 className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-500" />
                Convites Pendentes Nesta Viagem ({pendingInvites.length})
              </h4>
              <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                {pendingInvites.map((inv) => (
                  <div
                    key={inv.id}
                    className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="truncate">
                      <div className="font-semibold text-slate-800 truncate">
                        {inv.name || inv.email}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {inv.email} • Expira em {new Date(inv.expires_at).toLocaleDateString('pt-BR')}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleRevokeInvite(inv.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                        title="Cancelar convite"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

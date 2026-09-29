import React, { useState, useEffect } from 'react';
import { X, UserPlus, Shield, Trash2, Mail, CheckCircle2, Users, User, HeartHandshake, Copy, Check, ExternalLink, Clock, Send } from 'lucide-react';
import { TripMember, TripRole, TripTraveler, UserInvitation } from '../types/index.js';
import { api } from '../api/client.js';

interface MembersModalProps {
  tripId: string;
  members: TripMember[];
  onRefresh: () => void;
  onClose: () => void;
  canManage: boolean;
}

export const MembersModal: React.FC<MembersModalProps> = ({ tripId, members, onRefresh, onClose, canManage }) => {
  const [activeTab, setActiveTab] = useState<'members' | 'companions' | 'invitations'>('members');
  const [travelers, setTravelers] = useState<TripTraveler[]>([]);
  const [loadingTravelers, setLoadingTravelers] = useState(false);

  // Pending trip invitations
  const [pendingInvites, setPendingInvites] = useState<UserInvitation[]>([]);
  const [loadingInvites, setLoadingInvites] = useState(false);

  // Generated invite link from adding a member
  const [generatedInviteLink, setGeneratedInviteLink] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Invite member form state
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<TripRole>('VIEWER');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Companion form state
  const [companionName, setCompanionName] = useState('');
  const [companionDoc, setCompanionDoc] = useState('');
  const [companionEmail, setCompanionEmail] = useState('');
  const [companionSaving, setCompanionSaving] = useState(false);

  const loadTravelers = async () => {
    try {
      setLoadingTravelers(true);
      const res = await api.trips.listTravelers(tripId);
      setTravelers(res.travelers || []);
    } catch (err) {
      console.error('Erro ao carregar viajantes:', err);
    } finally {
      setLoadingTravelers(false);
    }
  };

  const loadPendingInvites = async () => {
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
    loadTravelers();
    loadPendingInvites();
  }, [tripId]);

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setGeneratedInviteLink(null);
    setCopiedLink(false);
    setLoading(true);

    try {
      const res = await api.trips.addMember(tripId, { email, role });
      if (res.inviteLink) {
        setGeneratedInviteLink(res.inviteLink);
      }
      setSuccess(res.message || `Participante ${email} adicionado! Convite enviado.`);
      setEmail('');
      onRefresh();
      await loadTravelers();
      await loadPendingInvites();
    } catch (err: any) {
      setError(err.message || 'Erro ao adicionar participante');
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    if (!window.confirm('Tem certeza que deseja cancelar este convite?')) return;
    try {
      await api.invites.revoke(inviteId);
      await loadPendingInvites();
    } catch (err: any) {
      alert(err.message || 'Erro ao cancelar convite');
    }
  };

  const handleAddCompanion = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setCompanionSaving(true);

    try {
      await api.trips.createCompanion(tripId, {
        displayName: companionName,
        documentNumber: companionDoc || undefined,
        email: companionEmail || undefined,
      });

      setSuccess(`Acompanhante ${companionName} cadastrado com sucesso!`);
      setCompanionName('');
      setCompanionDoc('');
      setCompanionEmail('');
      onRefresh();
      await loadTravelers();
    } catch (err: any) {
      setError(err.message || 'Erro ao cadastrar acompanhante');
    } finally {
      setCompanionSaving(false);
    }
  };

  const handleUpdateRole = async (memberId: string, newRole: string) => {
    try {
      await api.trips.updateMember(tripId, memberId, newRole);
      onRefresh();
      await loadTravelers();
    } catch (err: any) {
      alert(err.message || 'Erro ao atualizar papel');
    }
  };

  const handleRemoveMember = async (memberId: string, memberEmail: string) => {
    if (!window.confirm(`Remover ${memberEmail} da viagem?`)) return;
    try {
      await api.trips.removeMember(tripId, memberId);
      onRefresh();
      await loadTravelers();
    } catch (err: any) {
      alert(err.message || 'Erro ao remover participante');
    }
  };

  const handleRemoveTraveler = async (travelerId: string, name: string) => {
    if (!window.confirm(`Remover o acompanhante ${name} da viagem?`)) return;
    try {
      await api.trips.deleteTraveler(tripId, travelerId);
      onRefresh();
      await loadTravelers();
    } catch (err: any) {
      alert(err.message || 'Erro ao remover acompanhante');
    }
  };

  const companionsList = travelers.filter((t) => !t.is_registered_user);

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-brand-600" />
            <h2 className="text-lg font-bold text-slate-900">Viajantes & Participantes</h2>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 px-6 bg-slate-50/50 overflow-x-auto">
          <button
            onClick={() => { setActiveTab('members'); setError(null); setSuccess(null); }}
            className={`py-3 px-4 text-xs font-semibold border-b-2 flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${
              activeTab === 'members'
                ? 'border-brand-600 text-brand-700 bg-white rounded-t-lg shadow-2xs'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <User className="w-4 h-4" />
            Membros Ativos ({members.length})
          </button>
          <button
            onClick={() => { setActiveTab('companions'); setError(null); setSuccess(null); }}
            className={`py-3 px-4 text-xs font-semibold border-b-2 flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${
              activeTab === 'companions'
                ? 'border-brand-600 text-brand-700 bg-white rounded-t-lg shadow-2xs'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <HeartHandshake className="w-4 h-4" />
            Acompanhantes ({companionsList.length})
          </button>
          <button
            onClick={() => { setActiveTab('invitations'); setError(null); setSuccess(null); }}
            className={`py-3 px-4 text-xs font-semibold border-b-2 flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${
              activeTab === 'invitations'
                ? 'border-brand-600 text-brand-700 bg-white rounded-t-lg shadow-2xs'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Clock className="w-4 h-4" />
            Convites Pendentes ({pendingInvites.length})
          </button>
        </div>

        <div className="p-6 space-y-5">
          {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl">{error}</div>}
          {success && (
            <div className="p-3 bg-green-50 border border-green-200 text-green-700 text-xs rounded-xl flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              <span>{success}</span>
            </div>
          )}

          {/* Banner de Link de Convite Gerado */}
          {generatedInviteLink && (
            <div className="p-4 bg-brand-50 border border-brand-200 rounded-2xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-brand-900 flex items-center gap-1.5">
                  <ExternalLink className="w-3.5 h-3.5 text-brand-600" />
                  Link Único de Convite Gerado:
                </span>
                <button
                  onClick={() => setGeneratedInviteLink(null)}
                  className="text-slate-400 hover:text-slate-600 text-xs"
                >
                  Fechar
                </button>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={generatedInviteLink}
                  className="flex-1 px-3 py-1.5 text-xs bg-white border border-brand-200 rounded-lg text-slate-700 font-mono select-all focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(generatedInviteLink);
                    setCopiedLink(true);
                    setTimeout(() => setCopiedLink(false), 2500);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                    copiedLink
                      ? 'bg-emerald-600 text-white'
                      : 'bg-brand-600 hover:bg-brand-700 text-white shadow-xs'
                  }`}
                >
                  {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedLink ? 'Copiado!' : 'Copiar'}
                </button>
              </div>
              <p className="text-[11px] text-slate-600">
                Envie este link para a pessoa. Ao abrir, ela definirá sua própria senha e entrará imediatamente nesta viagem.
              </p>
            </div>
          )}

          {/* TAB 1: MEMBERS WITH LOGIN */}
          {activeTab === 'members' && (
            <>
              {canManage && (
                <form onSubmit={handleAddMember} className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Convidar Participante</h4>
                    <span className="text-[10px] text-slate-500">Novo usuário definirá a própria senha</span>
                  </div>
                  <div className="flex gap-2 flex-wrap sm:flex-nowrap">
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="E-mail da pessoa (ex: amigo@exemplo.com)"
                      className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
                    />
                    <select
                      value={role}
                      onChange={(e: any) => setRole(e.target.value)}
                      className="px-2.5 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="VIEWER">Visualizador</option>
                      <option value="EDITOR">Editor</option>
                      <option value="OWNER">Co-proprietário</option>
                    </select>
                    <button
                      type="submit"
                      disabled={loading}
                      className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-semibold shrink-0 cursor-pointer disabled:opacity-50"
                    >
                      {loading ? 'Convidando...' : 'Convidar'}
                    </button>
                  </div>
                </form>
              )}

              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Membros Ativos ({members.length})</h4>
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                  {members.map((m) => (
                    <div key={m.id} className="p-3 flex items-center justify-between gap-3 bg-white hover:bg-slate-50">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-xs text-slate-600">
                          {m.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-semibold text-xs text-slate-900">{m.name}</div>
                          <div className="text-[11px] text-slate-500">{m.email}</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {canManage && m.role !== 'OWNER' ? (
                          <select
                            value={m.role}
                            onChange={(e) => handleUpdateRole(m.id, e.target.value)}
                            className="text-xs border border-slate-300 rounded px-2 py-1 bg-white font-medium"
                          >
                            <option value="VIEWER">Visualizador</option>
                            <option value="EDITOR">Editor</option>
                            <option value="OWNER">Owner</option>
                          </select>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-brand-50 text-brand-700">
                            {m.role}
                          </span>
                        )}

                        {canManage && m.role !== 'OWNER' && (
                          <button
                            onClick={() => handleRemoveMember(m.id, m.email)}
                            className="p-1 text-slate-400 hover:text-red-600 rounded cursor-pointer"
                            title="Remover participante"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* TAB 2: COMPANIONS WITHOUT ACCOUNT */}
          {activeTab === 'companions' && (
            <>
              {canManage && (
                <form onSubmit={handleAddCompanion} className="p-4 bg-purple-50/60 rounded-xl border border-purple-200">
                  <h4 className="text-xs font-bold text-purple-900 uppercase tracking-wider mb-2">
                    Cadastrar Acompanhante (Sem Necessidade de Conta)
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">Nome Completo *</label>
                      <input
                        type="text"
                        required
                        value={companionName}
                        onChange={(e) => setCompanionName(e.target.value)}
                        placeholder="Ex: Mariana Costa"
                        className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">Passaporte / CPF (Opcional)</label>
                      <input
                        type="text"
                        value={companionDoc}
                        onChange={(e) => setCompanionDoc(e.target.value)}
                        placeholder="Ex: BR123456"
                        className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <p className="text-[11px] text-slate-500">
                      Ideal para cônjuges, filhos ou amigos que viajam juntos.
                    </p>
                    <button
                      type="submit"
                      disabled={companionSaving}
                      className="px-4 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-semibold shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {companionSaving ? 'Salvando...' : 'Adicionar Acompanhante'}
                    </button>
                  </div>
                </form>
              )}

              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Acompanhantes Cadastrados ({companionsList.length})
                </h4>
                {companionsList.length === 0 ? (
                  <div className="p-6 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-xl">
                    Nenhum acompanhante cadastrado ainda. Eles podem ser adicionados aqui ou criados automaticamente na importação de passagens/reservas.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                    {companionsList.map((c) => (
                      <div key={c.id} className="p-3 flex items-center justify-between gap-3 bg-white hover:bg-slate-50">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-purple-100 border border-purple-200 flex items-center justify-center font-bold text-xs text-purple-700">
                            {c.display_name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-semibold text-xs text-slate-900">{c.display_name}</div>
                            <div className="text-[11px] text-slate-500">
                              {c.ticket_name ? `Bilhete: ${c.ticket_name}` : 'Acompanhante'}
                              {c.document_number ? ` • Doc: ${c.document_number}` : ''}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                            Acompanhante
                          </span>

                          {canManage && (
                            <button
                              onClick={() => handleRemoveTraveler(c.id, c.display_name)}
                              className="p-1 text-slate-400 hover:text-red-600 rounded cursor-pointer"
                              title="Remover acompanhante"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* TAB 3: PENDING INVITATIONS */}
          {activeTab === 'invitations' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Convites Pendentes ({pendingInvites.length})
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Pessoas convidadas que ainda não definiram sua senha e ativaram o acesso
                  </p>
                </div>
              </div>

              {loadingInvites ? (
                <div className="py-8 text-center text-xs text-slate-400">Carregando convites...</div>
              ) : pendingInvites.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-xl">
                  Nenhum convite pendente para esta viagem. Utilize a aba "Membros Ativos" para convidar novos participantes.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white">
                  {pendingInvites.map((inv) => (
                    <div key={inv.id} className="p-3.5 flex items-center justify-between gap-3 hover:bg-slate-50">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center font-bold text-xs">
                          {(inv.name || inv.email).charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-semibold text-xs text-slate-900">{inv.name || inv.email}</div>
                          <div className="text-[11px] text-slate-500 flex items-center gap-2">
                            <span>{inv.email}</span>
                            <span>•</span>
                            <span>Expira em: {new Date(inv.expires_at).toLocaleDateString('pt-BR')}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                          {inv.trip_role === 'OWNER' ? 'Co-proprietário' : inv.trip_role === 'EDITOR' ? 'Editor' : 'Visualizador'}
                        </span>

                        {canManage && (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={async () => {
                                try {
                                  const res = await api.invites.create({
                                    email: inv.email,
                                    name: inv.name || undefined,
                                    tripId,
                                    tripRole: inv.trip_role || 'VIEWER',
                                  });
                                  if (res.inviteLink) {
                                    setGeneratedInviteLink(res.inviteLink);
                                    navigator.clipboard.writeText(res.inviteLink);
                                    setSuccess(`Novo link gerado e copiado para ${inv.email}!`);
                                  }
                                } catch (e: any) {
                                  setError(e.message || 'Erro ao gerar novo link');
                                }
                              }}
                              className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors cursor-pointer"
                              title="Reenviar / Copiar link de convite"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>

                            <button
                              onClick={() => handleRevokeInvite(inv.id)}
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                              title="Cancelar convite"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

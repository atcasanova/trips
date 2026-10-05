import React, { useState, useEffect } from 'react';
import { X, UserPlus, Shield, User as UserIcon, Trash2, CheckCircle2, AlertCircle, KeyRound, Lock, ShieldAlert, Copy, Check, ExternalLink, Send } from 'lucide-react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';
import { User } from '../types/index.js';

interface AdminUsersModalProps {
  onClose: () => void;
}

export const AdminUsersModal: React.FC<AdminUsersModalProps> = ({ onClose }) => {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Tabs: 'users' | 'my-password'
  const [activeTab, setActiveTab] = useState<'users' | 'my-password'>('users');

  // New user form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<'USER' | 'ADMIN'>('USER');
  const [saving, setSaving] = useState(false);
  const [createdInviteLink, setCreatedInviteLink] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Reset password for specific user
  const [resetTargetUser, setResetTargetUser] = useState<User | null>(null);
  const [targetNewPassword, setTargetNewPassword] = useState('');
  const [targetConfirmPassword, setTargetConfirmPassword] = useState('');
  const [resetSaving, setResetSaving] = useState(false);

  // Admin personal password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [confirmAdminPassword, setConfirmAdminPassword] = useState('');
  const [adminPasswordSaving, setAdminPasswordSaving] = useState(false);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const data = await api.users.list();
      setUsers(data.users);
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar usuários');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setCreatedInviteLink(null);
    setCopiedLink(false);
    setSaving(true);

    try {
      const res = await api.users.create({
        name: newName,
        email: newEmail,
        role: newRole,
      });

      if (res.inviteLink) {
        setCreatedInviteLink(res.inviteLink);
      }
      setSuccess(`Convite criado para ${newEmail}! O usuário definirá sua senha ao acessar o link único.`);
      setNewName('');
      setNewEmail('');
      setNewRole('USER');
      setShowAddForm(false);
      await loadUsers();
    } catch (err: any) {
      setError(err.message || 'Erro ao criar usuário');
    } finally {
      setSaving(false);
    }
  };

  // Delete user confirmation state
  const [confirmUserDelete, setConfirmUserDelete] = useState<User | null>(null);
  const [isDeletingUser, setIsDeletingUser] = useState(false);

  const handleDeleteUser = (user: User) => {
    setConfirmUserDelete(user);
  };

  const handleConfirmDeleteUser = async () => {
    if (!confirmUserDelete) return;
    setIsDeletingUser(true);
    try {
      await api.users.delete(confirmUserDelete.id);
      setSuccess(`Usuário ${confirmUserDelete.email} excluído.`);
      setConfirmUserDelete(null);
      await loadUsers();
    } catch (err: any) {
      setError(err.message || 'Erro ao excluir usuário');
    } finally {
      setIsDeletingUser(false);
    }
  };

  const handleToggleStatus = async (user: User) => {
    const nextStatus = user.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    try {
      await api.users.update(user.id, { status: nextStatus });
      await loadUsers();
    } catch (err: any) {
      setError(err.message || 'Erro ao atualizar status');
    }
  };

  // Handle setting a new password for any user directly
  const handleResetUserPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTargetUser) return;
    setError(null);
    setSuccess(null);

    if (targetNewPassword.length < 6) {
      setError('A nova senha deve ter no mínimo 6 caracteres');
      return;
    }
    if (targetNewPassword !== targetConfirmPassword) {
      setError('A confirmação de senha não confere');
      return;
    }

    setResetSaving(true);
    try {
      await api.users.update(resetTargetUser.id, { password: targetNewPassword });
      setSuccess(`Senha do usuário ${resetTargetUser.email} atualizada com sucesso!`);
      setResetTargetUser(null);
      setTargetNewPassword('');
      setTargetConfirmPassword('');
    } catch (err: any) {
      setError(err.message || 'Erro ao redefinir senha do usuário');
    } finally {
      setResetSaving(false);
    }
  };

  // Handle admin changing their own password
  const handleUpdateAdminPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (newAdminPassword.length < 6) {
      setError('A nova senha deve possuir pelo menos 6 caracteres');
      return;
    }
    if (newAdminPassword !== confirmAdminPassword) {
      setError('A confirmação da nova senha não coincide');
      return;
    }

    setAdminPasswordSaving(true);
    try {
      await api.auth.updatePassword({
        currentPassword,
        newPassword: newAdminPassword,
      });

      setSuccess('Sua senha de administrador foi alterada com sucesso! A partir de agora, a senha definida no arquivo .env é ignorada.');
      setCurrentPassword('');
      setNewAdminPassword('');
      setConfirmAdminPassword('');
    } catch (err: any) {
      setError(err.message || 'Erro ao alterar sua senha de administrador');
    } finally {
      setAdminPasswordSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-purple-600" />
            <h2 className="text-lg font-bold text-slate-900">Painel de Administração</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 px-6 bg-slate-50/50">
          <button
            onClick={() => { setActiveTab('users'); setError(null); setSuccess(null); }}
            className={`py-3 px-4 text-xs font-semibold border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'users'
                ? 'border-purple-600 text-purple-700 bg-white shadow-xs rounded-t-lg'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <UserIcon className="w-4 h-4" />
            Usuários do Sistema ({users.length})
          </button>
          <button
            onClick={() => { setActiveTab('my-password'); setError(null); setSuccess(null); }}
            className={`py-3 px-4 text-xs font-semibold border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'my-password'
                ? 'border-purple-600 text-purple-700 bg-white shadow-xs rounded-t-lg'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <KeyRound className="w-4 h-4" />
            Alterar Minha Senha
          </button>
        </div>

        {/* Alerts */}
        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-xl flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{success}</span>
            </div>
          )}

          {/* TAB 1: USER MANAGEMENT */}
          {activeTab === 'users' && (
            <>
              {/* Action Bar */}
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs text-slate-500">
                  Gerencie contas, permissões e redefina credenciais de acesso.
                </p>
                <button
                  onClick={() => setShowAddForm(!showAddForm)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                >
                  <UserPlus className="w-4 h-4" />
                  {showAddForm ? 'Cancelar' : 'Novo Usuário'}
                </button>
              </div>

              {/* Banner de Link de Convite Gerado */}
              {createdInviteLink && (
                <div className="mb-4 p-4 bg-brand-50 border border-brand-200 rounded-2xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-brand-900 flex items-center gap-1.5">
                      <ExternalLink className="w-3.5 h-3.5 text-brand-600" />
                      Link Único de Convite Gerado (Válido por 7 dias):
                    </span>
                    <button
                      onClick={() => setCreatedInviteLink(null)}
                      className="text-slate-400 hover:text-slate-600 text-xs"
                    >
                      Fechar
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={createdInviteLink}
                      className="flex-1 px-3 py-1.5 text-xs bg-white border border-brand-200 rounded-lg text-slate-700 font-mono select-all focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(createdInviteLink);
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
                    O convidado receberá um e-mail com este link para definir sua própria senha pessoal no primeiro acesso.
                  </p>
                </div>
              )}

              {/* New User Form */}
              {showAddForm && (
                <form onSubmit={handleCreateUser} className="mb-6 p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <h3 className="text-sm font-semibold text-slate-900 mb-1">Cadastrar / Convidar Novo Usuário</h3>
                  <p className="text-xs text-slate-500 mb-3">
                    A senha não é definida previamente. O usuário definirá sua própria senha através do link único enviado por e-mail.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Nome Completo</label>
                      <input
                        type="text"
                        required
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:outline-none"
                        placeholder="Ex: Ana Costa"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">E-mail</label>
                      <input
                        type="email"
                        required
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:outline-none"
                        placeholder="ana@exemplo.com"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Papel</label>
                      <select
                        value={newRole}
                        onChange={(e: any) => setNewRole(e.target.value)}
                        className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:outline-none"
                      >
                        <option value="USER">Usuário Padrão</option>
                        <option value="ADMIN">Administrador</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowAddForm(false)}
                      className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-200 rounded-lg cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={saving}
                      className="px-4 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                    >
                      {saving ? 'Gerando convite...' : 'Enviar Convite'}
                    </button>
                  </div>
                </form>
              )}

              {/* Reset Password Modal for a target user */}
              {resetTargetUser && (
                <div className="mb-6 p-4 bg-purple-50 rounded-xl border border-purple-200">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-bold text-purple-900 flex items-center gap-1.5">
                      <KeyRound className="w-4 h-4 text-purple-600" />
                      Redefinir Senha de: <span className="underline">{resetTargetUser.name}</span> ({resetTargetUser.email})
                    </h3>
                    <button
                      type="button"
                      onClick={() => setResetTargetUser(null)}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <form onSubmit={handleResetUserPassword} className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">Nova Senha</label>
                        <input
                          type="password"
                          required
                          minLength={6}
                          value={targetNewPassword}
                          onChange={(e) => setTargetNewPassword(e.target.value)}
                          placeholder="Mínimo 6 caracteres"
                          className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">Confirmar Senha</label>
                        <input
                          type="password"
                          required
                          minLength={6}
                          value={targetConfirmPassword}
                          onChange={(e) => setTargetConfirmPassword(e.target.value)}
                          placeholder="Repita a nova senha"
                          className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:outline-none"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setResetTargetUser(null)}
                        className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-200 rounded-lg cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={resetSaving}
                        className="px-4 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                      >
                        {resetSaving ? 'Salvando...' : 'Confirmar Nova Senha'}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* User List Table */}
              {loading ? (
                <div className="py-12 text-center text-slate-400 text-sm">Carregando usuários...</div>
              ) : (
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 text-slate-600 font-semibold uppercase tracking-wider text-[10px]">
                      <tr>
                        <th className="px-4 py-2.5">Usuário</th>
                        <th className="px-4 py-2.5">Papel</th>
                        <th className="px-4 py-2.5">Status</th>
                        <th className="px-4 py-2.5">Último Login</th>
                        <th className="px-4 py-2.5 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {users.map((u) => (
                        <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center font-bold text-slate-600 text-[11px]">
                                {u.avatar_url ? (
                                  <img src={u.avatar_url} alt={u.name} className="w-full h-full rounded-full object-cover" />
                                ) : (
                                  u.name.charAt(0).toUpperCase()
                                )}
                              </div>
                              <div>
                                <div className="font-semibold text-slate-900">{u.name}</div>
                                <div className="text-[11px] text-slate-500">{u.email}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {u.role === 'ADMIN' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-100 text-purple-700">
                                <Shield className="w-3 h-3" /> Admin
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600">
                                <UserIcon className="w-3 h-3" /> Usuário
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {u.status === 'INVITED' ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800">
                                Convidado
                              </span>
                            ) : (
                              <button
                                onClick={() => handleToggleStatus(u)}
                                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold transition-colors cursor-pointer ${
                                  u.status === 'ACTIVE'
                                    ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                                    : 'bg-red-100 text-red-700 hover:bg-red-200'
                                }`}
                              >
                                {u.status === 'ACTIVE' ? 'Ativo' : 'Suspenso'}
                              </button>
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-500 text-[11px]">
                            {u.last_login_at
                              ? new Date(u.last_login_at).toLocaleDateString('pt-BR', {
                                  day: '2-digit',
                                  month: '2-digit',
                                  year: '2-digit',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : u.status === 'INVITED' ? 'Aguardando aceite' : 'Nunca'}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {u.status === 'INVITED' && (
                                <button
                                  onClick={async () => {
                                    try {
                                      const res = await api.invites.create({ email: u.email, name: u.name });
                                      if (res.inviteLink) {
                                        setCreatedInviteLink(res.inviteLink);
                                        navigator.clipboard.writeText(res.inviteLink);
                                        setSuccess(`Link de convite para ${u.email} copiado para a área de transferência!`);
                                      }
                                    } catch (e: any) {
                                      setError(e.message || 'Erro ao gerar link de convite');
                                    }
                                  }}
                                  className="p-1.5 text-slate-500 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors cursor-pointer"
                                  title="Copiar / Reenviar link de convite"
                                >
                                  <Copy className="w-4 h-4" />
                                </button>
                              )}
                              <button
                                onClick={() => {
                                  setResetTargetUser(u);
                                  setTargetNewPassword('');
                                  setTargetConfirmPassword('');
                                }}
                                className="p-1.5 text-slate-500 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors cursor-pointer"
                                title="Redefinir senha deste usuário"
                              >
                                <KeyRound className="w-4 h-4" />
                              </button>
                              {currentUser?.id !== u.id && (
                                <button
                                  onClick={() => handleDeleteUser(u)}
                                  className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                                  title="Excluir usuário"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* TAB 2: ADMIN PERSONAL PASSWORD */}
          {activeTab === 'my-password' && (
            <div className="max-w-md mx-auto py-2">
              <div className="mb-5 p-4 bg-amber-50 border border-amber-200/80 rounded-xl text-xs text-amber-900 flex items-start gap-3">
                <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-amber-950 mb-1">Precedência de Segurança</p>
                  <p className="text-[11px] leading-relaxed text-amber-800">
                    Ao alterar sua senha aqui, ela será criptografada com <strong>Argon2id</strong> e persistida com segurança no banco de dados.
                    O sistema <strong>ignorará permanentemente a variável ADMIN_PASSWORD do arquivo .env</strong> em reinicializações para preservar a senha definida por você.
                  </p>
                </div>
              </div>

              <form onSubmit={handleUpdateAdminPassword} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Senha Atual</label>
                  <div className="relative">
                    <Lock className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                    <input
                      type="password"
                      required
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Sua senha atual"
                      className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Nova Senha</label>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={newAdminPassword}
                      onChange={(e) => setNewAdminPassword(e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                      className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Confirmar Nova Senha</label>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={confirmAdminPassword}
                      onChange={(e) => setConfirmAdminPassword(e.target.value)}
                      placeholder="Repita a nova senha"
                      className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={adminPasswordSaving}
                    className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold shadow-md shadow-purple-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {adminPasswordSaving ? 'Alterando Senha...' : 'Gravar Nova Senha'}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>

      {/* Modal de Confirmação de Exclusão de Usuário */}
      {confirmUserDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-red-600 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Excluir Usuário</h3>
                <p className="text-xs text-slate-500">Esta ação não pode ser desfeita.</p>
              </div>
            </div>

            <p className="text-sm text-slate-600 mb-5">
              Tem certeza que deseja excluir permanentemente o usuário <strong className="text-slate-900">{confirmUserDelete.name}</strong> ({confirmUserDelete.email})?
            </p>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmUserDelete(null)}
                disabled={isDeletingUser}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteUser}
                disabled={isDeletingUser}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold shadow-md shadow-red-500/20 transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                {isDeletingUser ? 'Excluindo...' : 'Sim, Excluir Usuário'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

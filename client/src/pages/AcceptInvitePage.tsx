import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Plane,
  Lock,
  Mail,
  User as UserIcon,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Eye,
  EyeOff,
  Compass,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.js';
import { api } from '../api/client.js';
import { InviteDetails } from '../types/index.js';

export const AcceptInvitePage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { refreshUser } = useAuth();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [invite, setInvite] = useState<InviteDetails | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setLoadError('Token de convite não encontrado no link.');
      setLoading(false);
      return;
    }

    api.invites
      .get(token)
      .then((data) => {
        setInvite(data);
        if (data.name) setName(data.name);
      })
      .catch((err: any) => {
        setLoadError(err.message || 'Convite inválido, expirado ou já utilizado.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!token) return;

    if (!name.trim()) {
      setFormError('Por favor, informe seu nome.');
      return;
    }

    if (password.length < 6) {
      setFormError('A senha deve ter pelo menos 6 caracteres.');
      return;
    }

    if (password !== confirmPassword) {
      setFormError('As senhas não coincidem.');
      return;
    }

    setSubmitting(true);

    try {
      const res = await api.invites.accept(token, {
        name: name.trim(),
        password,
      });

      setSuccess(true);
      // Atualiza o contexto de autenticação com o novo usuário ativo
      await refreshUser();

      setTimeout(() => {
        if (res.tripId) {
          navigate(`/trips/${res.tripId}`, { replace: true });
        } else {
          navigate('/', { replace: true });
        }
      }, 1500);
    } catch (err: any) {
      setFormError(err.message || 'Falha ao aceitar o convite e criar a conta.');
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin mx-auto mb-4" />
          <h2 className="text-sm font-semibold text-slate-700">Verificando seu convite...</h2>
          <p className="text-xs text-slate-400 mt-1">Aguarde um instante</p>
        </div>
      </div>
    );
  }

  if (loadError || !invite) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-tr from-slate-600 to-slate-400 flex items-center justify-center text-white shadow-xl mb-4">
            <Compass className="w-8 h-8 -rotate-12" />
          </div>
          <h1 className="text-2xl font-bold font-serif text-slate-900">Convite Indisponível</h1>
        </div>

        <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white py-8 px-6 shadow-xl shadow-slate-200/60 rounded-3xl border border-slate-200 text-center">
            <div className="w-12 h-12 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <AlertCircle className="w-6 h-6" />
            </div>
            <p className="text-sm font-medium text-slate-800 mb-2">{loadError}</p>
            <p className="text-xs text-slate-500 mb-6">
              Este link pode ter expirado (validade de 7 dias) ou já ter sido aceito anteriormente.
            </p>
            <Link
              to="/login"
              className="inline-flex items-center justify-center w-full py-2.5 px-4 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm font-semibold transition-all shadow-md shadow-brand-500/20"
            >
              Ir para o Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-tr from-brand-600 to-brand-400 flex items-center justify-center text-white shadow-xl shadow-brand-500/25 mb-4">
          <Plane className="w-8 h-8 -rotate-45" />
        </div>
        <h1 className="text-3xl font-bold font-serif tracking-tight text-slate-900">Bem-vindo ao Trips</h1>
        <p className="mt-1 text-xs text-slate-500">Crie sua senha pessoal para ativar seu acesso</p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 sm:px-10 shadow-xl shadow-slate-200/60 rounded-3xl border border-slate-200/80">
          {/* Card com detalhes do convite */}
          <div className="mb-6 p-4 rounded-2xl bg-brand-50/60 border border-brand-100 flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-brand-600 text-white flex items-center justify-center shrink-0 shadow-sm">
              <Compass className="w-5 h-5" />
            </div>
            <div className="text-xs">
              <span className="font-semibold text-brand-900 block">
                {invite.inviterName} convidou você
              </span>
              {invite.tripTitle ? (
                <span className="text-brand-700 block mt-0.5">
                  Para participar da viagem <strong className="text-brand-900">{invite.tripTitle}</strong> como{' '}
                  <strong className="text-brand-900">
                    {invite.tripRole === 'OWNER'
                      ? 'Co-Organizador'
                      : invite.tripRole === 'EDITOR'
                      ? 'Editor'
                      : 'Participante'}
                  </strong>
                  .
                </span>
              ) : (
                <span className="text-brand-700 block mt-0.5">
                  Para fazer parte da plataforma de planejamento colaborativo Trips.
                </span>
              )}
            </div>
          </div>

          {success ? (
            <div className="py-6 text-center space-y-3">
              <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-sm">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h3 className="text-base font-bold text-slate-800">Conta ativada com sucesso!</h3>
              <p className="text-xs text-slate-500">Redirecionando você para o sistema...</p>
              <div className="pt-2">
                <Loader2 className="w-5 h-5 text-brand-600 animate-spin mx-auto" />
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* E-mail (Somente Leitura) */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Seu E-mail</label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                  <input
                    type="email"
                    disabled
                    value={invite.email}
                    className="w-full pl-9 pr-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-600 font-medium cursor-not-allowed select-none"
                  />
                  <CheckCircle2 className="w-4 h-4 absolute right-3 top-3 text-emerald-500" />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Este convite está vinculado exclusivamente a este e-mail.</p>
              </div>

              {/* Nome */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Seu Nome Completo</label>
                <div className="relative">
                  <UserIcon className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Como você deseja ser chamado"
                    className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-brand-500 focus:outline-none transition-all"
                  />
                </div>
              </div>

              {/* Nova Senha */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Defina sua Senha Pessoal
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Pelo menos 6 caracteres"
                    className="w-full pl-9 pr-10 py-2.5 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-brand-500 focus:outline-none transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Confirmar Senha */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Confirmar Senha
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repita sua senha"
                    className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-brand-500 focus:outline-none transition-all"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full mt-2 py-3 px-4 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold shadow-md shadow-brand-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Salvando e acessando...
                  </>
                ) : (
                  'Ativar Conta e Acessar'
                )}
              </button>
            </form>
          )}

          <div className="mt-6 pt-5 border-t border-slate-100 text-center">
            <p className="text-[11px] text-slate-400 flex items-center justify-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              Sua senha é protegida com criptografia Argon2id de alta segurança
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plane, Lock, Mail, ShieldCheck, AlertCircle, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext.js';
import { api } from '../api/client.js';

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement | string,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          'expired-callback'?: () => void;
          'error-callback'?: () => void;
          theme?: 'light' | 'dark' | 'auto';
        }
      ) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

export const LoginPage: React.FC = () => {
  const { login, user } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Turnstile state
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileEnabled, setTurnstileEnabled] = useState(false);
  const [siteKey, setSiteKey] = useState<string>('');
  const turnstileContainerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  // If already logged in, redirect to dashboard
  useEffect(() => {
    if (user) {
      navigate('/');
    }
  }, [user, navigate]);

  // Check health and turnstile status
  useEffect(() => {
    api.health
      .check()
      .then((data) => {
        if (data.components?.integrations?.turnstileEnabled) {
          setTurnstileEnabled(true);
          if (data.components.integrations.turnstileSiteKey) {
            setSiteKey(data.components.integrations.turnstileSiteKey);
          }
        }
      })
      .catch(() => {});
  }, []);

  // Initialize Cloudflare Turnstile script and widget
  useEffect(() => {
    if (!turnstileEnabled || !siteKey || !turnstileContainerRef.current) return;

    let isMounted = true;

    const renderWidget = () => {
      if (!isMounted || !turnstileContainerRef.current || !window.turnstile) return;
      if (widgetIdRef.current) return; // already rendered

      try {
        const id = window.turnstile.render(turnstileContainerRef.current, {
          sitekey: siteKey,
          callback: (token: string) => {
            if (isMounted) {
              setTurnstileToken(token);
              setError(null);
            }
          },
          'expired-callback': () => {
            if (isMounted) setTurnstileToken(null);
          },
          'error-callback': () => {
            if (isMounted) {
              setTurnstileToken(null);
              setError('Falha ao carregar o widget Turnstile. Verifique se o domínio da aplicação está cadastrado na Cloudflare.');
            }
          },
          theme: 'light',
        });
        widgetIdRef.current = id;
      } catch (err) {
        console.error('Erro ao renderizar Turnstile:', err);
      }
    };

    if (window.turnstile) {
      renderWidget();
    } else {
      let script = document.querySelector('script[src*="turnstile"]') as HTMLScriptElement;
      if (!script) {
        script = document.createElement('script');
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async = true;
        script.defer = true;
        script.onload = () => {
          setTimeout(renderWidget, 100);
        };
        document.head.appendChild(script);
      } else {
        const checkInterval = setInterval(() => {
          if (window.turnstile) {
            clearInterval(checkInterval);
            renderWidget();
          }
        }, 100);
        return () => clearInterval(checkInterval);
      }
    }

    return () => {
      isMounted = false;
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch (e) {}
        widgetIdRef.current = null;
      }
    };
  }, [turnstileEnabled, siteKey]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (turnstileEnabled && !turnstileToken) {
      setError('Por favor, complete a verificação de segurança (Turnstile).');
      return;
    }

    setLoading(true);

    try {
      await login(email, password, turnstileToken || undefined);
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Falha ao autenticar. Verifique seus dados.');
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.reset(widgetIdRef.current);
        } catch (e) {}
        setTurnstileToken(null);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        {/* Logo */}
        <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-tr from-brand-600 to-brand-400 flex items-center justify-center text-white shadow-xl shadow-brand-500/25 mb-4">
          <Plane className="w-8 h-8 -rotate-45" />
        </div>
        <h1 className="text-3xl font-bold font-serif tracking-tight text-slate-900">Trips</h1>
        <p className="mt-1 text-xs text-slate-500">Gestão Inteligente de Viagens & Trip Book Editorial</p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <div className="bg-white py-8 px-6 sm:px-10 shadow-xl shadow-slate-200/60 rounded-3xl border border-slate-200/80">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">E-mail</label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                <input
                  type="email"
                  required
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu.email@exemplo.com"
                  className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-brand-500 focus:outline-none transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Senha</label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-brand-500 focus:outline-none transition-all"
                />
              </div>
            </div>

            {/* Cloudflare Turnstile Container if enabled */}
            {turnstileEnabled && (
              <div className="my-3 flex flex-col items-center justify-center min-h-[65px]">
                <div ref={turnstileContainerRef} />
              </div>
            )}

            <button
              type="submit"
              disabled={loading || (turnstileEnabled && !turnstileToken)}
              className="w-full py-3 px-4 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold shadow-md shadow-brand-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Entrar no Sistema'}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-slate-100 text-center">
            <p className="text-[11px] text-slate-400 flex items-center justify-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              Acesso seguro com criptografia Argon2id e HttpOnly Cookies
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

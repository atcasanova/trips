import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Shield,
  Cpu,
  Database,
  HardDrive,
  Sparkles,
  Users,
  Plane,
  MapPin,
  TrendingUp,
  Activity,
  Clock,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Calendar,
  FileText,
  RefreshCw,
  Search,
  Filter,
  ExternalLink,
  Layers,
  Server,
  Mail,
  UserPlus,
  Compass,
  ArrowRight,
  Receipt,
  Globe,
  Check,
} from 'lucide-react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';
import { AdminUsersModal } from '../components/AdminUsersModal.js';

type AdminTab = 'overview' | 'ai-audits' | 'group-trips' | 'users' | 'destinations';

export const AdminDashboardPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal for adding users / invites
  const [showUsersModal, setShowUsersModal] = useState(false);

  // Data states
  const [overview, setOverview] = useState<any>(null);
  const [aiAudits, setAiAudits] = useState<any>(null);
  const [usersStats, setUsersStats] = useState<any[]>([]);
  const [groupTrips, setGroupTrips] = useState<any[]>([]);
  const [destinations, setDestinations] = useState<any>(null);

  // AI filter state
  const [aiOpFilter, setAiOpFilter] = useState('ALL');
  const [aiStatusFilter, setAiStatusFilter] = useState('ALL');

  // Group trips filter state
  const [groupFilter, setGroupFilter] = useState<'all' | 'group' | 'solo'>('all');

  // Selected audit log for detail inspection
  const [selectedAuditLog, setSelectedAuditLog] = useState<any | null>(null);

  // Check admin permission
  useEffect(() => {
    if (user && user.role !== 'ADMIN') {
      navigate('/', { replace: true });
    }
  }, [user, navigate]);

  const loadAllData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const [ovData, aiData, usData, gtData, destData] = await Promise.all([
        api.admin.getOverview(),
        api.admin.getAiAudits({ operation: aiOpFilter !== 'ALL' ? aiOpFilter : undefined, status: aiStatusFilter !== 'ALL' ? aiStatusFilter : undefined }),
        api.admin.getUsers(),
        api.admin.getGroupTrips(groupFilter),
        api.admin.getDestinations(),
      ]);

      setOverview(ovData);
      setAiAudits(aiData);
      setUsersStats(usData.users || []);
      setGroupTrips(gtData.trips || []);
      setDestinations(destData);
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar dados do painel administrativo');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [aiOpFilter, aiStatusFilter, groupFilter]);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  const formatDate = (isoString?: string | null) => {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  const formatShortDate = (isoString?: string | null) => {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    } catch {
      return isoString;
    }
  };

  const formatUptime = (seconds: number) => {
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const parts = [];
    if (d > 0) parts.push(`${d}d`);
    if (h > 0) parts.push(`${h}h`);
    parts.push(`${m}m`);
    return parts.join(' ');
  };

  if (loading && !overview) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center space-y-4">
        <div className="w-10 h-10 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin" />
        <p className="text-sm font-medium text-slate-600">Carregando métricas do painel administrativo...</p>
      </div>
    );
  }

  const counts = overview?.counts || {};
  const tech = overview?.techStack || {};
  const adoption = overview?.productAdoption || {};

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 text-white rounded-3xl p-6 sm:p-8 shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <span className="p-2 bg-white/10 backdrop-blur rounded-xl text-purple-300">
                <Shield className="w-5 h-5" />
              </span>
              <span className="text-xs font-semibold uppercase tracking-wider text-purple-300 bg-purple-950/60 px-2.5 py-0.5 rounded-full border border-purple-500/30">
                Gestão & Auditoria do Sistema
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-serif font-bold text-white tracking-tight">
              Painel do Administrador
            </h1>
            <p className="text-xs sm:text-sm text-purple-200/80 max-w-2xl">
              Medições de IA, infraestrutura da stack, saúde do sistema, viagens em grupo e métricas de adoção do produto para priorização contínua.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => loadAllData(true)}
              disabled={refreshing}
              className="flex items-center gap-2 px-3.5 py-2 bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-xl text-xs font-semibold backdrop-blur transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span>{refreshing ? 'Atualizando...' : 'Atualizar'}</span>
            </button>

            <button
              onClick={() => setShowUsersModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-purple-500 hover:bg-purple-400 text-white rounded-xl text-xs font-semibold shadow-md transition-all cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Gerenciar Usuários</span>
            </button>
          </div>
        </div>

        {/* Quick KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-6 pt-6 border-t border-white/10">
          <div className="bg-white/5 backdrop-blur rounded-2xl p-3 border border-white/5">
            <div className="flex items-center justify-between text-purple-200 text-xs mb-1">
              <span>Usuários</span>
              <Users className="w-3.5 h-3.5 text-purple-400" />
            </div>
            <div className="text-xl font-bold text-white">{counts.activeUsers || 0}</div>
            <div className="text-[11px] text-purple-300/70">{counts.totalUsers} cadastrados</div>
          </div>

          <div className="bg-white/5 backdrop-blur rounded-2xl p-3 border border-white/5">
            <div className="flex items-center justify-between text-purple-200 text-xs mb-1">
              <span>Viagens</span>
              <Plane className="w-3.5 h-3.5 text-indigo-400" />
            </div>
            <div className="text-xl font-bold text-white">{counts.totalTrips || 0}</div>
            <div className="text-[11px] text-purple-300/70">{counts.groupTrips || 0} em grupo ({counts.soloTrips || 0} solo)</div>
          </div>

          <div className="bg-white/5 backdrop-blur rounded-2xl p-3 border border-white/5">
            <div className="flex items-center justify-between text-purple-200 text-xs mb-1">
              <span>Chamadas IA</span>
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            </div>
            <div className="text-xl font-bold text-white">{counts.totalAiCalls || 0}</div>
            <div className="text-[11px] text-amber-300/80">{Math.round((counts.totalAiTokens || 0) / 1000)}k tokens</div>
          </div>

          <div className="bg-white/5 backdrop-blur rounded-2xl p-3 border border-white/5">
            <div className="flex items-center justify-between text-purple-200 text-xs mb-1">
              <span>Custo Est. IA</span>
              <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="text-xl font-bold text-emerald-400">
              ${aiAudits?.summary?.estimatedCostUsd ? Number(aiAudits.summary.estimatedCostUsd).toFixed(2) : '0.00'}
            </div>
            <div className="text-[11px] text-purple-300/70">{aiAudits?.summary?.successRate || 100}% taxa de sucesso</div>
          </div>

          <div className="bg-white/5 backdrop-blur rounded-2xl p-3 border border-white/5">
            <div className="flex items-center justify-between text-purple-200 text-xs mb-1">
              <span>Banco & Storage</span>
              <Database className="w-3.5 h-3.5 text-cyan-400" />
            </div>
            <div className="text-xl font-bold text-white">{tech.database?.size || '—'}</div>
            <div className="text-[11px] text-purple-300/70">{tech.storage?.totalSizeFormatted || '0 MB'} uploads</div>
          </div>

          <div className="bg-white/5 backdrop-blur rounded-2xl p-3 border border-white/5">
            <div className="flex items-center justify-between text-purple-200 text-xs mb-1">
              <span>Uptime Servidor</span>
              <Server className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="text-xl font-bold text-white">
              {tech.server?.uptimeSeconds ? formatUptime(tech.server.uptimeSeconds) : '—'}
            </div>
            <div className="text-[11px] text-purple-300/70">{tech.server?.memoryRssMb || 0} MB RAM (RSS)</div>
          </div>
        </div>
      </div>

      {/* Tabs Bar */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-3 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'overview'
              ? 'bg-purple-600 text-white shadow-sm shadow-purple-600/20'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Cpu className="w-4 h-4" />
          <span>Visão Geral & Stack</span>
        </button>

        <button
          onClick={() => setActiveTab('ai-audits')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'ai-audits'
              ? 'bg-purple-600 text-white shadow-sm shadow-purple-600/20'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>Auditoria & Medições de IA</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-purple-500/20 text-purple-700 font-bold">
            {counts.totalAiCalls || 0}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('group-trips')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'group-trips'
              ? 'bg-purple-600 text-white shadow-sm shadow-purple-600/20'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Viagens em Grupo & Participantes</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-purple-500/20 text-purple-700 font-bold">
            {counts.groupTrips || 0} grupos
          </span>
        </button>

        <button
          onClick={() => setActiveTab('users')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'users'
              ? 'bg-purple-600 text-white shadow-sm shadow-purple-600/20'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Estatísticas por Usuário</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-purple-500/20 text-purple-700 font-bold">
            {usersStats.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('destinations')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'destinations'
              ? 'bg-purple-600 text-white shadow-sm shadow-purple-600/20'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Globe className="w-4 h-4" />
          <span>Cidades & Destinos</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-purple-500/20 text-purple-700 font-bold">
            {destinations?.cities?.length || 0}
          </span>
        </button>
      </div>

      {/* TAB 1: VISÃO GERAL & STACK */}
      {activeTab === 'overview' && (
        <div className="space-y-8">
          {/* Row 1: Stack & Product Adoption Funnel */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Tech Stack Card */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Server className="w-5 h-5 text-purple-600" />
                  <h3 className="font-serif font-bold text-slate-900 text-base">Stack Tecnológica & Saúde</h3>
                </div>
                <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-[11px] font-semibold flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Operacional
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-1">
                  <span className="text-slate-500 text-[11px] flex items-center gap-1">
                    <Database className="w-3.5 h-3.5 text-slate-400" /> PostgreSQL
                  </span>
                  <div className="font-bold text-slate-800 text-sm">{tech.database?.size || '—'}</div>
                  <div className="text-[10px] text-slate-400">Tamanho da base</div>
                </div>

                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-1">
                  <span className="text-slate-500 text-[11px] flex items-center gap-1">
                    <HardDrive className="w-3.5 h-3.5 text-slate-400" /> Uploads (/data)
                  </span>
                  <div className="font-bold text-slate-800 text-sm">{tech.storage?.totalSizeFormatted || '0 MB'}</div>
                  <div className="text-[10px] text-slate-400">{tech.storage?.totalFiles || 0} arquivos salvos</div>
                </div>

                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-1">
                  <span className="text-slate-500 text-[11px] flex items-center gap-1">
                    <Cpu className="w-3.5 h-3.5 text-slate-400" /> Node Runtime
                  </span>
                  <div className="font-bold text-slate-800 text-sm">{tech.server?.nodeVersion || 'Node.js'}</div>
                  <div className="text-[10px] text-slate-400">{tech.server?.platform} ({tech.server?.arch})</div>
                </div>
              </div>

              {/* Integrations checklist */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Integrações & Serviços</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                  <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="flex items-center gap-1.5 font-medium text-slate-700">
                      <Sparkles className="w-3.5 h-3.5 text-purple-600" /> OpenAI ({tech.integrations?.openAiModel || 'gpt-5.6-luna'})
                    </span>
                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-semibold text-[10px]">
                      Ativo
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="flex items-center gap-1.5 font-medium text-slate-700">
                      <MapPin className="w-3.5 h-3.5 text-indigo-600" /> Geocoding IA ({tech.integrations?.openAiMapModel || 'gpt-5.6-luna'})
                    </span>
                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-semibold text-[10px]">
                      Ativo
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="flex items-center gap-1.5 font-medium text-slate-700">
                      <Mail className="w-3.5 h-3.5 text-blue-600" /> Inbound SMTP & E-mail
                    </span>
                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-semibold text-[10px]">
                      Configurado
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="flex items-center gap-1.5 font-medium text-slate-700">
                      <Shield className="w-3.5 h-3.5 text-amber-600" /> Cloudflare Turnstile
                    </span>
                    <span className="px-2 py-0.5 bg-slate-200 text-slate-700 rounded font-semibold text-[10px]">
                      {tech.integrations?.turnstileEnabled ? 'Habilitado' : 'Opcional (Dev)'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Major DB Tables */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Principais Tabelas da Base</h4>
                <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-xl text-xs">
                  {tech.database?.tables?.map((tbl: any, idx: number) => (
                    <div key={idx} className="flex items-center justify-between px-3 py-2 hover:bg-slate-50">
                      <span className="font-mono text-slate-700">{tbl.name}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-slate-500 font-medium">{tbl.rows} registros</span>
                        <span className="text-[11px] font-mono px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">
                          {tbl.size}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Product Adoption & Engagement Card */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-indigo-600" />
                  <h3 className="font-serif font-bold text-slate-900 text-base">Adoção de Funcionalidades (Oportunidades)</h3>
                </div>
                <span className="text-xs text-slate-500 font-medium bg-slate-100 px-2.5 py-1 rounded-full">
                  Base: {adoption.totalTrips || 0} viagens ativas
                </span>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed">
                Métricas de uso do produto que identificam onde os usuários mais engajam e quais recursos têm potencial de melhoria ou divulgação:
              </p>

              <div className="space-y-3.5">
                {[
                  { label: 'Roteiros Estruturados via IA', ...adoption.withAi, color: 'bg-purple-600', note: 'Alta adoção e forte engajamento' },
                  { label: 'Documentos & Vouchers Anexados', ...adoption.withDocuments, color: 'bg-blue-600', note: 'Usado para guardar comprovantes' },
                  { label: 'Viagens em Grupo (Colaborativas)', ...adoption.groupTrips, color: 'bg-indigo-600', note: 'Múltiplos membros compartilhando' },
                  { label: 'Controle de Gastos & Rateio', ...adoption.withExpenses, color: 'bg-emerald-600', note: 'Divisão de despesas ativa' },
                  { label: 'Voos & Transportes Cadastrados', ...adoption.withTransports, color: 'bg-amber-600', note: 'Trechos e cartões de embarque' },
                  { label: 'Links Públicos Compartilhados', ...adoption.publicTrips, color: 'bg-cyan-600', note: 'Visualização web externa' },
                  { label: 'Reservas de Hotel', ...adoption.withHotels, color: 'bg-rose-500', note: 'Oportunidade: simplificar inserção' },
                  { label: 'Trip Book / Relatório Exportado', ...adoption.withReports, color: 'bg-orange-500', note: 'Oportunidade: incentivar geração' },
                ].map((item, idx) => (
                  <div key={idx} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-800">{item.label}</span>
                      <span className="font-bold text-slate-900">{item.percent || 0}% ({item.count || 0})</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${item.color}`}
                        style={{ width: `${Math.max(item.percent || 0, 2)}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-slate-400 italic">{item.note}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Row 2: Recent Activity Audit Logs */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-purple-600" />
                <h3 className="font-serif font-bold text-slate-900 text-base">Atividades Recentes no Sistema (Audit Log)</h3>
              </div>
              <span className="text-xs text-slate-500">Últimos eventos registrados</span>
            </div>

            <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto text-xs">
              {overview?.recentActivities?.length === 0 ? (
                <p className="text-slate-400 py-4 text-center">Nenhuma atividade recente registrada.</p>
              ) : (
                overview?.recentActivities?.map((act: any) => (
                  <div key={act.id} className="py-2.5 flex items-center justify-between gap-4 hover:bg-slate-50 px-2 rounded-lg">
                    <div className="flex items-center gap-3">
                      <span className="p-1.5 bg-purple-50 text-purple-700 rounded-lg">
                        <Activity className="w-3.5 h-3.5" />
                      </span>
                      <div>
                        <strong className="text-slate-800 font-semibold">{act.action}</strong>
                        <p className="text-[11px] text-slate-500">
                          {act.user_name || 'Sistema'} {act.trip_title ? `• Viagem: "${act.trip_title}"` : ''}
                        </p>
                      </div>
                    </div>
                    <span className="text-[11px] text-slate-400 font-mono whitespace-nowrap">
                      {formatDate(act.created_at)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: AUDITORIA & MEDIÇÕES DE IA */}
      {activeTab === 'ai-audits' && (
        <div className="space-y-8">
          {/* Summary Metric Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-1">
              <span className="text-slate-500 text-xs font-semibold uppercase tracking-wider">Total de Chamadas</span>
              <div className="text-2xl font-bold font-serif text-slate-900">{aiAudits?.summary?.totalCalls || 0}</div>
              <div className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> {aiAudits?.summary?.successRate || 100}% taxa de sucesso
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-1">
              <span className="text-slate-500 text-xs font-semibold uppercase tracking-wider">Tokens Consumidos</span>
              <div className="text-2xl font-bold font-serif text-purple-700">
                {(aiAudits?.summary?.totalTokens || 0).toLocaleString()}
              </div>
              <div className="text-[11px] text-slate-500">
                Prompt: {(aiAudits?.summary?.totalPromptTokens || 0).toLocaleString()} • Comp: {(aiAudits?.summary?.totalCompletionTokens || 0).toLocaleString()}
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-1">
              <span className="text-slate-500 text-xs font-semibold uppercase tracking-wider">Custo Estimado</span>
              <div className="text-2xl font-bold font-serif text-emerald-600">
                ${Number(aiAudits?.summary?.estimatedCostUsd || 0).toFixed(4)} USD
              </div>
              <div className="text-[11px] text-slate-400">Baseado em tabela padrão OpenAI</div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-1">
              <span className="text-slate-500 text-xs font-semibold uppercase tracking-wider">Latência Média</span>
              <div className="text-2xl font-bold font-serif text-slate-900">
                {((aiAudits?.summary?.avgDurationMs || 0) / 1000).toFixed(1)}s
              </div>
              <div className="text-[11px] text-slate-500">
                P95: {((aiAudits?.summary?.p95DurationMs || 0) / 1000).toFixed(1)}s
              </div>
            </div>
          </div>

          {/* Breakdown by Operation & Model */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* By Operation */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
              <h3 className="font-serif font-bold text-slate-900 text-base flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-600" />
                Medições por Tipo de Operação
              </h3>

              <div className="divide-y divide-slate-100 text-xs">
                {aiAudits?.byOperation?.map((op: any, idx: number) => (
                  <div key={idx} className="py-3 flex items-center justify-between hover:bg-slate-50 px-2 rounded-lg">
                    <div className="space-y-0.5">
                      <span className="font-mono font-bold text-purple-900 text-xs bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                        {op.operation}
                      </span>
                      <p className="text-[11px] text-slate-500 pt-1">
                        {op.count} chamadas • Duração média: {(op.avgDurationMs / 1000).toFixed(1)}s
                      </p>
                    </div>

                    <div className="text-right">
                      <span className="font-bold text-slate-800">{op.totalTokens.toLocaleString()} tokens</span>
                      {op.errorCount > 0 ? (
                        <p className="text-[11px] text-rose-600 font-semibold">{op.errorCount} erros</p>
                      ) : (
                        <p className="text-[11px] text-emerald-600">100% sucesso</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* By Model & User */}
            <div className="space-y-6">
              {/* By Model */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                <h3 className="font-serif font-bold text-slate-900 text-base flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-indigo-600" />
                  Modelos Utilizados
                </h3>
                <div className="divide-y divide-slate-100 text-xs">
                  {aiAudits?.byModel?.map((m: any, idx: number) => (
                    <div key={idx} className="py-2.5 flex items-center justify-between">
                      <div>
                        <strong className="text-slate-800 font-mono">{m.model}</strong>
                        <p className="text-[11px] text-slate-500">{m.count} requisições • Média {(m.avgDurationMs / 1000).toFixed(1)}s</p>
                      </div>
                      <div className="text-right font-mono text-slate-700">
                        {m.totalTokens.toLocaleString()} tokens
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* By User */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                <h3 className="font-serif font-bold text-slate-900 text-base flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-600" />
                  Consumo por Usuário
                </h3>
                <div className="divide-y divide-slate-100 text-xs">
                  {aiAudits?.byUser?.map((u: any, idx: number) => (
                    <div key={idx} className="py-2.5 flex items-center justify-between">
                      <div>
                        <strong className="text-slate-800">{u.userName}</strong>
                        <p className="text-[11px] text-slate-500">{u.userEmail}</p>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-slate-800">{u.callsCount} chamadas</span>
                        <p className="text-[11px] text-purple-600 font-mono">{u.totalTokens.toLocaleString()} tokens</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Interactive Audit Logs Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-serif font-bold text-slate-900 text-base">Registros de Auditoria de IA</h3>
                <p className="text-xs text-slate-500">Histórico detalhado de cada inferência com modelo, duração e tokens</p>
              </div>

              {/* Filters */}
              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={aiOpFilter}
                  onChange={(e) => setAiOpFilter(e.target.value)}
                  className="text-xs border border-slate-300 rounded-xl px-2.5 py-1.5 bg-white text-slate-700"
                >
                  <option value="ALL">Todas as Operações</option>
                  <option value="PARSE_ITINERARY_TEXT">PARSE_ITINERARY_TEXT</option>
                  <option value="ITINERARY_LOCATION_RESOLUTION">LOCATION_RESOLUTION</option>
                  <option value="DOCUMENT_EXTRACTION">DOCUMENT_EXTRACTION</option>
                  <option value="NARRATIVE_GENERATION">NARRATIVE_GENERATION</option>
                </select>

                <select
                  value={aiStatusFilter}
                  onChange={(e) => setAiStatusFilter(e.target.value)}
                  className="text-xs border border-slate-300 rounded-xl px-2.5 py-1.5 bg-white text-slate-700"
                >
                  <option value="ALL">Todos os Status</option>
                  <option value="SUCCESS">Sucesso</option>
                  <option value="ERROR">Erro</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 font-semibold bg-slate-50 uppercase text-[10px]">
                    <th className="py-2.5 px-3">Data / Hora</th>
                    <th className="py-2.5 px-3">Operação</th>
                    <th className="py-2.5 px-3">Modelo</th>
                    <th className="py-2.5 px-3">Usuário</th>
                    <th className="py-2.5 px-3">Viagem</th>
                    <th className="py-2.5 px-3 text-right">Tokens</th>
                    <th className="py-2.5 px-3 text-right">Duração</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {aiAudits?.recentLogs?.map((log: any) => (
                    <tr
                      key={log.id}
                      onClick={() => setSelectedAuditLog(log)}
                      className="hover:bg-purple-50/50 cursor-pointer transition-colors"
                    >
                      <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">{formatDate(log.created_at)}</td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-purple-100 text-purple-800">
                          {log.operation}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">{log.model}</td>
                      <td className="py-2.5 px-3 text-slate-800 font-sans">{log.user_name || 'Sistema'}</td>
                      <td className="py-2.5 px-3 text-slate-600 font-sans truncate max-w-[150px]">
                        {log.trip_title || '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                        {(log.total_tokens || 0).toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-600">
                        {((log.duration_ms || 0) / 1000).toFixed(2)}s
                      </td>
                      <td className="py-2.5 px-3 text-center font-sans">
                        {log.status === 'SUCCESS' ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                            OK
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                            ERRO
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: VIAGENS EM GRUPO & PARTICIPANTES */}
      {activeTab === 'group-trips' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-serif font-bold text-slate-900">Gestão de Viagens & Grupos</h2>
              <p className="text-xs text-slate-500">
                Visualize quem participa de cada viagem, papéis (Dono, Editor, Visualizador) e acompanhantes
              </p>
            </div>

            {/* Filter Pills */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-semibold">
              <button
                onClick={() => setGroupFilter('all')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  groupFilter === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Todas ({overview?.counts?.totalTrips || 0})
              </button>
              <button
                onClick={() => setGroupFilter('group')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  groupFilter === 'group' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Em Grupo ({overview?.counts?.groupTrips || 0})
              </button>
              <button
                onClick={() => setGroupFilter('solo')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  groupFilter === 'solo' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Individuais ({overview?.counts?.soloTrips || 0})
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {groupTrips.map((trip) => (
              <div
                key={trip.id}
                className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
              >
                <div>
                  {/* Top Bar with image / gradient */}
                  <div className="relative h-28 bg-gradient-to-r from-slate-800 to-indigo-900 p-4 flex flex-col justify-between text-white">
                    {trip.coverImageUrl && (
                      <img
                        src={trip.coverImageUrl}
                        alt={trip.title}
                        className="absolute inset-0 w-full h-full object-cover opacity-35"
                      />
                    )}
                    <div className="relative z-10 flex items-center justify-between">
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-white/20 backdrop-blur border border-white/20 text-white">
                        {trip.isGroupTrip ? '👥 Viagem em Grupo' : '👤 Viagem Solo'}
                      </span>
                      <span className="text-[11px] font-mono bg-black/40 px-2 py-0.5 rounded backdrop-blur">
                        {trip.status}
                      </span>
                    </div>

                    <div className="relative z-10">
                      <h3 className="font-serif font-bold text-lg text-white leading-tight drop-shadow-sm">
                        {trip.title}
                      </h3>
                      <p className="text-xs text-white/80 truncate">
                        {trip.destinationSummary || (trip.cities?.length ? trip.cities.join(', ') : 'Destino a definir')}
                      </p>
                    </div>
                  </div>

                  {/* Body Content */}
                  <div className="p-5 space-y-4 text-xs">
                    {/* Dates & Metrics */}
                    <div className="flex items-center justify-between text-slate-600 pb-3 border-b border-slate-100">
                      <span className="flex items-center gap-1 font-medium">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        {formatShortDate(trip.startDate)} — {formatShortDate(trip.endDate)}
                      </span>
                      <div className="flex items-center gap-3 font-semibold text-slate-700">
                        <span>{trip.counts.days} dias</span>
                        <span>•</span>
                        <span>{trip.counts.items} itens</span>
                        <span>•</span>
                        <span>{trip.counts.expenses} gastos</span>
                      </div>
                    </div>

                    {/* Owner */}
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-purple-100 text-purple-700 font-bold flex items-center justify-center text-xs">
                        {trip.owner?.name?.charAt(0) || 'U'}
                      </div>
                      <div>
                        <div className="font-semibold text-slate-800">
                          {trip.owner?.name || 'Administrador'} <span className="text-[10px] text-purple-600 font-bold">(Criador)</span>
                        </div>
                        <div className="text-[11px] text-slate-400">{trip.owner?.email}</div>
                      </div>
                    </div>

                    {/* Members List */}
                    <div className="space-y-1.5 pt-1">
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                        Membros com Acesso ({trip.members.length}):
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {trip.members.map((m: any, mIdx: number) => (
                          <div
                            key={mIdx}
                            className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-xl"
                          >
                            <span className="font-medium text-slate-800">{m.name}</span>
                            <span
                              className={`text-[9px] font-bold px-1.5 py-0.2 rounded uppercase ${
                                m.role === 'OWNER'
                                  ? 'bg-purple-100 text-purple-800'
                                  : m.role === 'EDITOR'
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-slate-200 text-slate-700'
                              }`}
                            >
                              {m.role}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Travelers List */}
                    {trip.travelers && trip.travelers.length > 0 && (
                      <div className="space-y-1 pt-1">
                        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                          Passageiros / Acompanhantes ({trip.travelers.length}):
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {trip.travelers.map((t: any, tIdx: number) => (
                            <span
                              key={tIdx}
                              className="px-2 py-0.5 bg-indigo-50 border border-indigo-100 rounded-lg text-indigo-900 font-medium text-[11px]"
                            >
                              {t.name} {t.is_companion && <span className="text-indigo-400 text-[10px]">(Acomp.)</span>}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Pending invitations if any */}
                    {trip.pendingInvitations && trip.pendingInvitations.length > 0 && (
                      <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs flex items-center justify-between">
                        <span className="flex items-center gap-1.5 font-medium">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-600" /> Convite pendente para {trip.pendingInvitations[0].email}
                        </span>
                        <span className="text-[10px] bg-amber-200 px-1.5 py-0.5 rounded font-bold">
                          {trip.pendingInvitations[0].role}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer link */}
                <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-xs text-slate-500 font-mono">
                    ID: {trip.id.substring(0, 8)}...
                  </span>
                  <Link
                    to={`/trips/${trip.id}`}
                    className="flex items-center gap-1 text-xs font-semibold text-purple-700 hover:text-purple-800 hover:underline"
                  >
                    <span>Abrir Viagem</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: ESTATÍSTICAS POR USUÁRIO */}
      {activeTab === 'users' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <h2 className="font-serif font-bold text-slate-900 text-lg">Estatísticas por Usuário</h2>
              <p className="text-xs text-slate-500">
                Engajamento individual, consumo de IA, viagens criadas e documentos enviados
              </p>
            </div>
            <button
              onClick={() => setShowUsersModal(true)}
              className="flex items-center gap-2 px-3.5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Convidar / Cadastrar Usuário</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-semibold bg-slate-50 uppercase text-[10px]">
                  <th className="py-3 px-3">Usuário</th>
                  <th className="py-3 px-3">Função / Status</th>
                  <th className="py-3 px-3 text-center">Viagens Criadas</th>
                  <th className="py-3 px-3 text-center">Participações</th>
                  <th className="py-3 px-3 text-right">Chamadas IA</th>
                  <th className="py-3 px-3 text-right">Tokens IA</th>
                  <th className="py-3 px-3 text-center">Docs</th>
                  <th className="py-3 px-3 text-center">Gastos</th>
                  <th className="py-3 px-3">Último Acesso</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {usersStats.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-700 font-bold flex items-center justify-center text-xs">
                          {u.name?.charAt(0) || 'U'}
                        </div>
                        <div>
                          <strong className="text-slate-900 block font-semibold">{u.name}</strong>
                          <span className="text-[11px] text-slate-500">{u.email}</span>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            u.role === 'ADMIN' ? 'bg-purple-100 text-purple-800' : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {u.role}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            u.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                          }`}
                        >
                          {u.status}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-center font-bold text-slate-800">{u.tripsCreated}</td>
                    <td className="py-3 px-3 text-center font-semibold text-slate-600">{u.tripsParticipating}</td>
                    <td className="py-3 px-3 text-right font-bold text-purple-700">{u.aiCalls}</td>
                    <td className="py-3 px-3 text-right font-mono text-slate-700">
                      {(u.aiTokens || 0).toLocaleString()}
                    </td>
                    <td className="py-3 px-3 text-center text-slate-600">{u.documentsUploaded}</td>
                    <td className="py-3 px-3 text-center text-slate-600">{u.expensesCreated}</td>
                    <td className="py-3 px-3 text-slate-500 whitespace-nowrap">{formatDate(u.lastLoginAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 5: CIDADES & DESTINOS POPULARES */}
      {activeTab === 'destinations' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Popular Cities */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <MapPin className="w-5 h-5 text-indigo-600" />
                <h3 className="font-serif font-bold text-slate-900 text-base">Cidades Mais Programadas</h3>
              </div>
              <span className="text-xs text-slate-500">Por dias de roteiro</span>
            </div>

            <div className="divide-y divide-slate-100 text-xs">
              {destinations?.cities?.map((c: any, idx: number) => (
                <div key={idx} className="py-3 flex items-center justify-between hover:bg-slate-50 px-2 rounded-lg">
                  <div className="flex items-center gap-2.5">
                    <span className="w-5 text-slate-400 font-mono text-center font-bold">{idx + 1}.</span>
                    <div>
                      <strong className="text-slate-800 font-semibold">{c.city}</strong>
                      <p className="text-[11px] text-slate-500">{c.tripsCount} viagem(ns) passando por lá</p>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 font-bold rounded-lg text-xs">
                    {c.daysCount} dias de roteiro
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Countries */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Globe className="w-5 h-5 text-purple-600" />
                <h3 className="font-serif font-bold text-slate-900 text-base">Países das Viagens</h3>
              </div>
              <span className="text-xs text-slate-500">Distribuição geográfica</span>
            </div>

            <div className="divide-y divide-slate-100 text-xs">
              {destinations?.countries?.map((c: any, idx: number) => (
                <div key={idx} className="py-3 flex items-center justify-between hover:bg-slate-50 px-2 rounded-lg">
                  <div className="flex items-center gap-2.5">
                    <span className="w-5 text-slate-400 font-mono text-center font-bold">{idx + 1}.</span>
                    <div>
                      <strong className="text-slate-800 font-semibold">{c.country}</strong>
                      <p className="text-[11px] text-slate-500">{c.planningTrips} em planejamento</p>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 bg-purple-50 text-purple-700 font-bold rounded-lg text-xs">
                    {c.tripsCount} viagem(ns)
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Audit Log Details */}
      {selectedAuditLog && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full border border-slate-200 overflow-hidden text-xs">
            <div className="p-4 bg-purple-50 border-b border-purple-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-600" />
                <h3 className="font-bold text-slate-900">Detalhe da Execução de IA</h3>
              </div>
              <button
                onClick={() => setSelectedAuditLog(null)}
                className="text-slate-400 hover:text-slate-700 p-1"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-3 font-mono">
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <span className="text-slate-400 block">Operação:</span>
                  <span className="font-bold text-purple-800">{selectedAuditLog.operation}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Modelo:</span>
                  <span className="text-slate-800">{selectedAuditLog.model}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Duração:</span>
                  <span className="text-slate-800">{selectedAuditLog.duration_ms} ms</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Tokens:</span>
                  <span className="text-slate-800">
                    {selectedAuditLog.total_tokens} (P: {selectedAuditLog.prompt_tokens} / C: {selectedAuditLog.completion_tokens})
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Usuário:</span>
                  <span className="text-slate-800 font-sans">{selectedAuditLog.user_name || 'Sistema'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Viagem:</span>
                  <span className="text-slate-800 font-sans">{selectedAuditLog.trip_title || '—'}</span>
                </div>
              </div>

              {selectedAuditLog.error_message && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800">
                  <strong className="block mb-1">Mensagem de Erro:</strong>
                  <pre className="whitespace-pre-wrap text-[10px]">{selectedAuditLog.error_message}</pre>
                </div>
              )}

              {selectedAuditLog.request_meta && (
                <div className="space-y-1">
                  <span className="text-slate-400 text-[10px]">Metadados da Requisição:</span>
                  <pre className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[10px] overflow-x-auto">
                    {JSON.stringify(selectedAuditLog.request_meta, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-100 text-right">
              <button
                onClick={() => setSelectedAuditLog(null)}
                className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold rounded-lg text-xs"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Admin Users & Invites Management */}
      {showUsersModal && <AdminUsersModal onClose={() => setShowUsersModal(false)} />}
    </div>
  );
};

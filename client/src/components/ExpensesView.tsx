import React, { useState, useEffect, useMemo } from 'react';
import {
  DollarSign,
  Plus,
  Trash2,
  Calendar,
  Tag,
  CreditCard,
  Users,
  User,
  ArrowRightLeft,
  ArrowRight,
  Scale,
  TrendingUp,
  PieChart,
  BarChart3,
  CheckCircle2,
  AlertCircle,
  Filter,
  Share2,
  Check,
  Building,
  Utensils,
  Plane,
  Ticket,
  ShoppingBag,
  MoreHorizontal,
  Edit2,
  Lock,
  Unlock,
  RotateCcw,
  Divide,
  Percent,
  X,
} from 'lucide-react';
import { ExpenseItem, TripTraveler, TravelerBalance, Settlement, ExpensesResponse } from '../types/index.js';
import { api } from '../api/client.js';
import { formatDateBr } from '../utils/date.js';
import { ExpensesDoughnutChart } from './ExpensesDoughnutChart.js';

interface ExpensesViewProps {
  tripId: string;
  canEdit: boolean;
  currentUserId?: string;
}

const CATEGORY_CONFIG: Record<string, { label: string; icon: any; color: string; bg: string }> = {
  FOOD: { label: 'Alimentação & Restaurantes', icon: Utensils, color: '#f59e0b', bg: 'bg-amber-100 text-amber-800' },
  TRANSPORT: { label: 'Transporte, Voos & Trens', icon: Plane, color: '#0284c7', bg: 'bg-sky-100 text-sky-800' },
  ACCOMMODATION: { label: 'Hospedagem & Hotéis', icon: Building, color: '#8b5cf6', bg: 'bg-purple-100 text-purple-800' },
  TICKETS: { label: 'Ingressos & Atrações', icon: Ticket, color: '#10b981', bg: 'bg-emerald-100 text-emerald-800' },
  SHOPPING: { label: 'Compras & Souvenirs', icon: ShoppingBag, color: '#ec4899', bg: 'bg-pink-100 text-pink-800' },
  OTHER: { label: 'Outros / Serviços', icon: MoreHorizontal, color: '#64748b', bg: 'bg-slate-100 text-slate-800' },
};

type SplitMode = 'PARTS' | 'EXACT';

export const ExpensesView: React.FC<ExpensesViewProps> = ({ tripId, canEdit, currentUserId }) => {
  const [data, setData] = useState<ExpensesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiedLink, setCopiedLink] = useState(false);

  // Filters
  const [selectedCurrency, setSelectedCurrency] = useState<string>('ALL');
  const [scopeFilter, setScopeFilter] = useState<'ALL' | 'SHARED' | 'PERSONAL'>('ALL');
  const [chartTravelerId, setChartTravelerId] = useState<string>('ALL');

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);

  // Modal Form Fields
  const [desc, setDesc] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('BRL');
  const [category, setCategory] = useState('FOOD');
  const [paymentMethod, setPaymentMethod] = useState('CREDIT_CARD');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [isShared, setIsShared] = useState(true);
  const [paidByTravelerId, setPaidByTravelerId] = useState<string>('');
  const [notes, setNotes] = useState('');

  // Splitting UI states
  const [selectedTravelers, setSelectedTravelers] = useState<string[]>([]);
  const [splitMode, setSplitMode] = useState<SplitMode>('PARTS');
  const [sharesByTraveler, setSharesByTraveler] = useState<Record<string, number>>({});
  const [exactAmounts, setExactAmounts] = useState<Record<string, number>>({});
  const [lockedTravelers, setLockedTravelers] = useState<Record<string, boolean>>({});

  const loadExpenses = async () => {
    try {
      setLoading(true);
      const res = await api.expenses.list(tripId);
      setData(res);

      if (res.travelers.length > 0 && !paidByTravelerId) {
        const userTraveler = res.travelers.find((t) => t.user_id === currentUserId);
        const defaultId = userTraveler ? userTraveler.id : res.travelers[0].id;
        setPaidByTravelerId(defaultId);
      }
    } catch (err: any) {
      console.error('Erro ao carregar despesas:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadExpenses();
  }, [tripId]);

  // Currencies list
  const availableCurrencies = useMemo(() => {
    if (!data) return ['BRL'];
    const keys = Object.keys(data.totalsByCurrency || {});
    return keys.length > 0 ? keys : ['BRL'];
  }, [data]);

  const activeSettlementCurrency = useMemo(() => {
    if (selectedCurrency !== 'ALL') return selectedCurrency;
    return availableCurrencies[0] || 'BRL';
  }, [selectedCurrency, availableCurrencies]);

  // Filtered expenses
  const filteredExpenses = useMemo(() => {
    if (!data) return [];
    return data.expenses.filter((exp) => {
      if (selectedCurrency !== 'ALL' && exp.currency !== selectedCurrency) return false;
      if (scopeFilter === 'SHARED' && !exp.is_shared) return false;
      if (scopeFilter === 'PERSONAL' && exp.is_shared) return false;
      return true;
    });
  }, [data, selectedCurrency, scopeFilter]);

  const counts = useMemo(() => {
    if (!data) return { all: 0, shared: 0, personal: 0 };
    const all = data.expenses.length;
    const shared = data.expenses.filter((e) => e.is_shared).length;
    const personal = all - shared;
    return { all, shared, personal };
  }, [data]);

  const currentBalances: TravelerBalance[] = useMemo(() => {
    if (!data?.balancesByCurrency) return [];
    return data.balancesByCurrency[activeSettlementCurrency] || [];
  }, [data, activeSettlementCurrency]);

  const currentSettlements: Settlement[] = useMemo(() => {
    if (!data?.settlementsByCurrency) return [];
    return data.settlementsByCurrency[activeSettlementCurrency] || [];
  }, [data, activeSettlementCurrency]);

  // Chart category breakdown
  const chartCategoryData = useMemo(() => {
    if (!data?.categoryBreakdown) return [];
    const currData = data.categoryBreakdown[activeSettlementCurrency];
    if (!currData) return [];

    let categoryMap: Record<string, number> = {};
    if (chartTravelerId === 'ALL') {
      categoryMap = currData.total || {};
    } else {
      categoryMap = currData.byTraveler[chartTravelerId] || {};
    }

    const total = Object.values(categoryMap).reduce((acc, val) => acc + val, 0);

    return Object.entries(categoryMap)
      .map(([catKey, val]) => {
        const conf = CATEGORY_CONFIG[catKey] || CATEGORY_CONFIG.OTHER;
        const pct = total > 0 ? (val / total) * 100 : 0;
        return {
          key: catKey,
          label: conf.label,
          color: conf.color,
          bg: conf.bg,
          icon: conf.icon,
          amount: val,
          percentage: pct,
        };
      })
      .sort((a, b) => b.amount - a.amount);
  }, [data, activeSettlementCurrency, chartTravelerId]);

  const chartTotalAmount = useMemo(() => {
    return chartCategoryData.reduce((acc, c) => acc + c.amount, 0);
  }, [chartCategoryData]);

  const largestDebtor = useMemo(() => {
    if (!currentBalances || currentBalances.length === 0) return null;
    const sorted = [...currentBalances].sort((a, b) => a.netBalance - b.netBalance);
    return sorted[0]?.netBalance < -0.01 ? sorted[0] : null;
  }, [currentBalances]);

  // Copy link
  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  // --- SPLIT CALCULATOR LOGIC ---

  // Initialize or reset split configuration
  const initSplitsForTravelers = (travelersList: string[], total: number) => {
    const shares: Record<string, number> = {};
    const exacts: Record<string, number> = {};
    const locks: Record<string, boolean> = {};

    const count = travelersList.length || 1;
    const equalShare = total > 0 ? Math.round((total / count) * 100) / 100 : 0;

    travelersList.forEach((id) => {
      shares[id] = 1; // default 1 part
      exacts[id] = equalShare;
      locks[id] = false;
    });

    setSharesByTraveler(shares);
    setExactAmounts(exacts);
    setLockedTravelers(locks);
  };

  // When amount changes in modal, rebalance unlocked exact amounts or shares
  const handleAmountChange = (newAmtStr: string) => {
    setAmount(newAmtStr);
    const newTotal = parseFloat(newAmtStr) || 0;

    if (splitMode === 'EXACT' && selectedTravelers.length > 0) {
      rebalanceExactAmounts(newTotal, exactAmounts, lockedTravelers, selectedTravelers);
    }
  };

  // Dynamic rebalancing for EXACT mode:
  // When a user edits one or more travelers, unlocked travelers receive equal shares of the remainder!
  const rebalanceExactAmounts = (
    total: number,
    currentExacts: Record<string, number>,
    locks: Record<string, boolean>,
    activeTravelers: string[]
  ) => {
    const lockedIds = activeTravelers.filter((id) => locks[id]);
    const unlockedIds = activeTravelers.filter((id) => !locks[id]);

    const lockedSum = lockedIds.reduce((sum, id) => sum + (currentExacts[id] || 0), 0);
    const remainder = Math.max(0, total - lockedSum);

    const updated = { ...currentExacts };

    if (unlockedIds.length > 0) {
      const share = Math.floor((remainder / unlockedIds.length) * 100) / 100;
      let distributed = 0;

      unlockedIds.forEach((id, idx) => {
        if (idx === unlockedIds.length - 1) {
          updated[id] = Math.max(0, Math.round((remainder - distributed) * 100) / 100);
        } else {
          updated[id] = share;
          distributed += share;
        }
      });
    }

    setExactAmounts(updated);
  };

  // User edits a specific traveler's exact amount
  const handleEditTravelerExact = (travelerId: string, valStr: string) => {
    const total = parseFloat(amount) || 0;
    const val = parseFloat(valStr) || 0;

    const newLocks = { ...lockedTravelers, [travelerId]: true };
    const newExacts = { ...exactAmounts, [travelerId]: val };

    setLockedTravelers(newLocks);
    rebalanceExactAmounts(total, newExacts, newLocks, selectedTravelers);
  };

  // Unlock traveler to participate in automatic distribution
  const handleUnlockTraveler = (travelerId: string) => {
    const total = parseFloat(amount) || 0;
    const newLocks = { ...lockedTravelers, [travelerId]: false };
    setLockedTravelers(newLocks);
    rebalanceExactAmounts(total, exactAmounts, newLocks, selectedTravelers);
  };

  // Reset all exact amounts to equal shares
  const handleResetEqualShares = () => {
    const total = parseFloat(amount) || 0;
    initSplitsForTravelers(selectedTravelers, total);
  };

  // User edits traveler's parts / shares
  const handleEditTravelerParts = (travelerId: string, partsVal: number) => {
    const validParts = Math.max(0, partsVal);
    setSharesByTraveler((prev) => ({ ...prev, [travelerId]: validParts }));
  };

  // Compute calculated amounts and percentages for the current mode
  const calculatedSplitsSummary = useMemo(() => {
    const total = parseFloat(amount) || 0;
    if (selectedTravelers.length === 0 || total <= 0) return { items: [], totalCalculated: 0 };

    if (splitMode === 'PARTS') {
      const totalShares = selectedTravelers.reduce(
        (sum, id) => sum + (sharesByTraveler[id] !== undefined ? sharesByTraveler[id] : 1),
        0
      );

      let allocatedSum = 0;
      const items = selectedTravelers.map((id, idx) => {
        const parts = sharesByTraveler[id] !== undefined ? sharesByTraveler[id] : 1;
        const pct = totalShares > 0 ? (parts / totalShares) * 100 : 0;
        let itemAmt = totalShares > 0 ? Math.floor(((total * parts) / totalShares) * 100) / 100 : 0;

        if (idx === selectedTravelers.length - 1 && totalShares > 0) {
          itemAmt = Math.round((total - allocatedSum) * 100) / 100;
        } else {
          allocatedSum += itemAmt;
        }

        const traveler = data?.travelers.find((t) => t.id === id);
        return {
          travelerId: id,
          name: traveler?.display_name || 'Viajante',
          parts,
          percentage: pct,
          amount: itemAmt,
          isLocked: false,
        };
      });

      const totalCalc = items.reduce((sum, it) => sum + it.amount, 0);
      return { items, totalCalculated: totalCalc };
    } else {
      // EXACT Mode
      const items = selectedTravelers.map((id) => {
        const itemAmt = exactAmounts[id] || 0;
        const pct = total > 0 ? (itemAmt / total) * 100 : 0;
        const traveler = data?.travelers.find((t) => t.id === id);
        return {
          travelerId: id,
          name: traveler?.display_name || 'Viajante',
          parts: 1,
          percentage: pct,
          amount: itemAmt,
          isLocked: Boolean(lockedTravelers[id]),
        };
      });

      const totalCalc = items.reduce((sum, it) => sum + it.amount, 0);
      return { items, totalCalculated: totalCalc };
    }
  }, [amount, selectedTravelers, splitMode, sharesByTraveler, exactAmounts, lockedTravelers, data]);

  // Open modal for NEW expense
  const handleOpenNewModal = () => {
    setEditingExpenseId(null);
    setDesc('');
    setAmount('');
    setCategory('FOOD');
    setPaymentMethod('CREDIT_CARD');
    setDate(new Date().toISOString().split('T')[0]);
    setIsShared(true);
    setNotes('');

    const allTravelerIds = (data?.travelers || []).map((t) => t.id);
    setSelectedTravelers(allTravelerIds);
    setSplitMode('PARTS');
    initSplitsForTravelers(allTravelerIds, 0);

    const userTraveler = data?.travelers.find((t) => t.user_id === currentUserId);
    setPaidByTravelerId(userTraveler ? userTraveler.id : data?.travelers[0]?.id || '');

    setShowModal(true);
  };

  // Open modal for EDIT expense
  const handleOpenEditModal = (exp: ExpenseItem) => {
    setEditingExpenseId(exp.id);
    setDesc(exp.description);
    setAmount(String(exp.amount));
    setCurrency(exp.currency || 'BRL');
    setCategory(exp.category || 'FOOD');
    setPaymentMethod(exp.payment_method || 'CREDIT_CARD');
    setDate(exp.date ? exp.date.split('T')[0] : new Date().toISOString().split('T')[0]);
    setIsShared(Boolean(exp.is_shared));
    setPaidByTravelerId(exp.paid_by_traveler_id || exp.traveler_id || '');
    setNotes(exp.notes || '');

    const allTravelerIds = (data?.travelers || []).map((t) => t.id);

    if (exp.splits && exp.splits.length > 0) {
      const activeIds = exp.splits.map((s) => s.traveler_id);
      setSelectedTravelers(activeIds.length > 0 ? activeIds : allTravelerIds);

      // Check if splits match custom exact amounts or parts
      const exacts: Record<string, number> = {};
      const locks: Record<string, boolean> = {};
      const shares: Record<string, number> = {};

      exp.splits.forEach((s) => {
        exacts[s.traveler_id] = parseFloat(String(s.amount)) || 0;
        locks[s.traveler_id] = true;
        shares[s.traveler_id] = 1;
      });

      setExactAmounts(exacts);
      setLockedTravelers(locks);
      setSharesByTraveler(shares);
      setSplitMode('EXACT');
    } else {
      setSelectedTravelers(allTravelerIds);
      initSplitsForTravelers(allTravelerIds, parseFloat(String(exp.amount)) || 0);
      setSplitMode('PARTS');
    }

    setShowModal(true);
  };

  // Save Expense (Create or Update)
  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      alert('Informe um valor válido');
      return;
    }

    if (!desc.trim()) {
      alert('Informe uma descrição para a despesa');
      return;
    }

    if (isShared && selectedTravelers.length === 0) {
      alert('Selecione pelo menos um viajante para dividir a despesa');
      return;
    }

    try {
      let splits: any[] | undefined = undefined;

      if (isShared) {
        splits = calculatedSplitsSummary.items.map((it) => ({
          traveler_id: it.travelerId,
          amount: it.amount,
          percentage: it.percentage,
        }));
      }

      if (editingExpenseId) {
        // Update existing expense
        await api.expenses.update(tripId, editingExpenseId, {
          description: desc,
          amount: numAmount,
          currency,
          category,
          payment_method: paymentMethod,
          date,
          is_shared: isShared,
          paid_by_traveler_id: paidByTravelerId || null,
          split_type: splitMode,
          notes: notes || null,
          splits,
        });
      } else {
        // Create new expense
        await api.expenses.create(tripId, {
          description: desc,
          amount: numAmount,
          currency,
          category,
          payment_method: paymentMethod,
          date,
          is_shared: isShared,
          paid_by_traveler_id: paidByTravelerId || null,
          split_type: splitMode,
          notes: notes || null,
          splits,
        });
      }

      setShowModal(false);
      loadExpenses();
    } catch (err: any) {
      alert(err.message || 'Erro ao salvar despesa');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir esta despesa?')) return;
    try {
      await api.expenses.delete(tripId, id);
      loadExpenses();
    } catch (err: any) {
      alert(err.message || 'Erro ao excluir despesa');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold font-serif text-slate-900">Controle Financeiro & Acertos</h2>
          <p className="text-xs text-slate-500">
            Divisão inteligente de despesas (estilo Splitwise & Tricount) com normalização independente por moeda
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyLink}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors"
            title="Copiar link direto para esta aba de despesas"
          >
            {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Share2 className="w-3.5 h-3.5" />}
            <span>{copiedLink ? 'Link Copiado!' : 'Copiar Link'}</span>
          </button>

          {canEdit && (
            <button
              onClick={handleOpenNewModal}
              className="flex items-center gap-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Nova Despesa</span>
            </button>
          )}
        </div>
      </div>

      {/* Currency Selector Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider shrink-0 flex items-center gap-1">
          <DollarSign className="w-3.5 h-3.5" /> Moeda:
        </span>
        <button
          onClick={() => setSelectedCurrency('ALL')}
          className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
            selectedCurrency === 'ALL'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          Todas as Moedas
        </button>
        {availableCurrencies.map((curr) => (
          <button
            key={curr}
            onClick={() => setSelectedCurrency(curr)}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
              selectedCurrency === curr
                ? 'bg-brand-600 text-white shadow-sm'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {curr}
          </button>
        ))}
      </div>

      {/* Financial Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Total Geral */}
        <div className="p-5 bg-white border border-slate-200 rounded-2xl shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Total de Gastos</span>
            <DollarSign className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-2 space-y-1">
            {Object.entries(data?.totalsByCurrency || {}).length === 0 ? (
              <span className="text-lg font-bold text-slate-400">0,00</span>
            ) : (
              Object.entries(data?.totalsByCurrency || {})
                .filter(([curr]) => selectedCurrency === 'ALL' || selectedCurrency === curr)
                .map(([curr, total]) => (
                  <div key={curr} className="flex items-baseline gap-1.5">
                    <span className="text-xs font-mono font-bold text-slate-500">{curr}</span>
                    <span className="text-xl font-extrabold text-slate-900">
                      {total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                ))
            )}
          </div>
        </div>

        {/* Compartilhadas do Grupo */}
        <div className="p-5 bg-white border border-indigo-100 rounded-2xl shadow-sm bg-gradient-to-br from-white to-indigo-50/30">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-indigo-500 tracking-wider">
              Despesas Compartilhadas
            </span>
            <Users className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="mt-2 space-y-1">
            {Object.entries(data?.sharedTotalsByCurrency || {}).length === 0 ? (
              <span className="text-lg font-bold text-slate-400">0,00</span>
            ) : (
              Object.entries(data?.sharedTotalsByCurrency || {})
                .filter(([curr]) => selectedCurrency === 'ALL' || selectedCurrency === curr)
                .map(([curr, total]) => (
                  <div key={curr} className="flex items-baseline gap-1.5">
                    <span className="text-xs font-mono font-bold text-indigo-600">{curr}</span>
                    <span className="text-xl font-extrabold text-indigo-950">
                      {total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                ))
            )}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">Divididas entre os membros do grupo</span>
        </div>

        {/* Individuais / Apenas Minhas */}
        <div className="p-5 bg-white border border-slate-200 rounded-2xl shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
              Despesas Individuais (Pessoais)
            </span>
            <User className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-2 space-y-1">
            {Object.entries(data?.personalTotalsByCurrency || {}).length === 0 ? (
              <span className="text-lg font-bold text-slate-400">0,00</span>
            ) : (
              Object.entries(data?.personalTotalsByCurrency || {})
                .filter(([curr]) => selectedCurrency === 'ALL' || selectedCurrency === curr)
                .map(([curr, total]) => (
                  <div key={curr} className="flex items-baseline gap-1.5">
                    <span className="text-xs font-mono font-bold text-slate-500">{curr}</span>
                    <span className="text-xl font-extrabold text-slate-900">
                      {total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                ))
            )}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">Custos particulares sem divisão</span>
        </div>
      </div>

      {/* SECTION: ACERTOS DO GRUPO (SPLITWISE / TRICOUNT) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <Scale className="w-5 h-5 text-indigo-600" />
              <h3 className="text-base font-bold font-serif text-slate-900">
                Divisão & Acertos do Grupo ({activeSettlementCurrency})
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Normalização de saldos: quem pagou, quanto deve e quem deve pagar a quem em {activeSettlementCurrency}
            </p>
          </div>

          {availableCurrencies.length > 1 && (
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-slate-400 text-[11px]">Ver acertos em:</span>
              {availableCurrencies.map((c) => (
                <button
                  key={c}
                  onClick={() => setSelectedCurrency(c)}
                  className={`px-2 py-0.5 rounded text-xs font-bold ${
                    activeSettlementCurrency === c
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Suggestion alert for largest debtor */}
        {largestDebtor && (
          <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between gap-3 text-xs text-amber-900">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                <strong>Sugestão de equilíbrio:</strong> {largestDebtor.name} está com o maior saldo devedor (
                {activeSettlementCurrency}{' '}
                {Math.abs(largestDebtor.netBalance).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}) neste
                momento. Pode pagar a próxima conta ou refeição coletiva para equilibrar as contas!
              </span>
            </div>
          </div>
        )}

        {/* Balances by traveler */}
        <div className="space-y-2">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
            Saldos Individuais no Grupo
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {currentBalances.map((b) => {
              const isCreditor = b.netBalance > 0.01;
              const isDebtor = b.netBalance < -0.01;

              return (
                <div
                  key={b.travelerId}
                  className={`p-4 rounded-xl border transition-all ${
                    isCreditor
                      ? 'bg-emerald-50/50 border-emerald-200 text-emerald-950'
                      : isDebtor
                      ? 'bg-rose-50/50 border-rose-200 text-rose-950'
                      : 'bg-slate-50 border-slate-200 text-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-xs">{b.name}</span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        isCreditor
                          ? 'bg-emerald-100 text-emerald-800'
                          : isDebtor
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {isCreditor ? 'Deve Receber' : isDebtor ? 'Deve Pagar' : 'Equilibrado ✓'}
                    </span>
                  </div>

                  <div className="flex items-baseline justify-between text-xs">
                    <span className="text-slate-500 text-[11px]">Saldo Líquido:</span>
                    <strong
                      className={`text-sm font-extrabold ${
                        isCreditor ? 'text-emerald-700' : isDebtor ? 'text-rose-700' : 'text-slate-600'
                      }`}
                    >
                      {b.netBalance > 0 ? '+' : ''}
                      {activeSettlementCurrency}{' '}
                      {b.netBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </strong>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-slate-200/60 text-[11px] text-slate-500">
                    <div>
                      <span>Pagou ao grupo:</span>
                      <strong className="block text-slate-800">
                        {activeSettlementCurrency}{' '}
                        {b.paid.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </strong>
                    </div>
                    <div>
                      <span>Sua cota devida:</span>
                      <strong className="block text-slate-800">
                        {activeSettlementCurrency}{' '}
                        {b.owed.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </strong>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Simplified Settlements */}
        <div className="pt-2">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2.5">
            Pagamentos Sugeridos para Quitação (Menor número de transações)
          </span>

          {currentSettlements.length === 0 ? (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Nenhum pagamento pendente em {activeSettlementCurrency}. As contas do grupo estão equilibradas!</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {currentSettlements.map((st, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-rose-800 bg-rose-100 px-2 py-0.5 rounded">
                      {st.fromName}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                    <span className="font-semibold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded">
                      {st.toName}
                    </span>
                  </div>

                  <strong className="font-mono font-bold text-slate-900 text-sm">
                    {activeSettlementCurrency}{' '}
                    {st.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </strong>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* SECTION: GRÁFICOS DE GASTOS POR CATEGORIA & POR PESSOA */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <PieChart className="w-5 h-5 text-purple-600" />
              <h3 className="text-base font-bold font-serif text-slate-900">
                Gráfico de Gastos por Categoria ({activeSettlementCurrency})
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Visualize a distribuição em {activeSettlementCurrency}, no total ou filtrada por cada viajante
            </p>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto">
            <span className="text-xs font-semibold text-slate-400 shrink-0">Filtrar por:</span>
            <button
              onClick={() => setChartTravelerId('ALL')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                chartTravelerId === 'ALL'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              👥 Grupo Todo
            </button>
            {data?.travelers.map((t) => (
              <button
                key={t.id}
                onClick={() => setChartTravelerId(t.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                  chartTravelerId === t.id
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                👤 {t.display_name}
              </button>
            ))}
          </div>
        </div>

        <ExpensesDoughnutChart
          data={chartCategoryData}
          currency={activeSettlementCurrency}
          totalAmount={chartTotalAmount}
          filterLabel={
            chartTravelerId === 'ALL'
              ? 'Grupo Todo'
              : data?.travelers.find((t) => t.id === chartTravelerId)?.display_name
          }
        />
      </div>

      {/* SECTION: LISTA DE DESPESAS COM BOTÃO EDITAR */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        {/* Table Filter Tabs */}
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setScopeFilter('ALL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                scopeFilter === 'ALL'
                  ? 'bg-slate-900 text-white'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              Todas ({counts.all})
            </button>
            <button
              onClick={() => setScopeFilter('SHARED')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 ${
                scopeFilter === 'SHARED'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              Compartilhadas ({counts.shared})
            </button>
            <button
              onClick={() => setScopeFilter('PERSONAL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 ${
                scopeFilter === 'PERSONAL'
                  ? 'bg-slate-700 text-white'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <User className="w-3.5 h-3.5" />
              Individuais ({counts.personal})
            </button>
          </div>

          <span className="text-xs text-slate-400">
            {filteredExpenses.length} despesas exibidas
          </span>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 text-slate-600 uppercase text-[10px] tracking-wider font-semibold">
              <tr>
                <th className="px-4 py-3">Data</th>
                <th className="px-4 py-3">Descrição</th>
                <th className="px-4 py-3">Categoria</th>
                <th className="px-4 py-3">Tipo / Divisão</th>
                <th className="px-4 py-3">Quem Pagou</th>
                <th className="px-4 py-3 text-right">Valor</th>
                {canEdit && <th className="px-4 py-3 text-center">Ações</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredExpenses.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400 italic">
                    Nenhuma despesa encontrada para os filtros selecionados.
                  </td>
                </tr>
              ) : (
                filteredExpenses.map((exp) => {
                  const catConf = CATEGORY_CONFIG[exp.category] || CATEGORY_CONFIG.OTHER;
                  return (
                    <tr key={exp.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 text-slate-500 font-mono text-[11px] whitespace-nowrap">
                        {formatDateBr(exp.date)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-semibold text-slate-900 block">{exp.description}</span>
                        {exp.notes && <span className="text-[10px] text-slate-400 block">{exp.notes}</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${catConf.bg}`}
                        >
                          {catConf.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {exp.is_shared ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200/60">
                            <Users className="w-3 h-3 text-indigo-500" />
                            {exp.splits && exp.splits.length > 0
                              ? `Dividida (${exp.splits.length} pessoas)`
                              : 'Compartilhada'}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600">
                            <User className="w-3 h-3 text-slate-400" />
                            Individual (Pessoal)
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap font-medium">
                        {exp.paid_by_name || 'Viajante'}
                      </td>
                      <td className="px-4 py-3 font-bold text-slate-900 text-right whitespace-nowrap">
                        <span className="text-[10px] text-slate-400 font-normal mr-1">{exp.currency}</span>
                        {parseFloat(String(exp.amount)).toLocaleString('pt-BR', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                      {canEdit && (
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => handleOpenEditModal(exp)}
                              className="flex items-center gap-1 px-2 py-1 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg text-xs font-semibold transition-colors"
                              title="Editar despesa e divisão"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                              <span>Editar</span>
                            </button>
                            <button
                              onClick={() => handleDelete(exp.id)}
                              className="p-1 text-slate-400 hover:text-red-600 rounded hover:bg-red-50 transition-colors"
                              title="Remover despesa"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL UNIFICADO: REGISTRAR / EDITAR DESPESA COM CALCULADORA DE DIVISÃO */}
      {showModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full p-6 border border-slate-200 max-h-[92vh] overflow-y-auto flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-base font-bold text-slate-900">
                {editingExpenseId ? 'Editar Despesa & Divisão' : 'Registrar Nova Despesa'}
              </h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveExpense} className="space-y-4 flex-1">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Descrição *</label>
                <input
                  type="text"
                  required
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  placeholder="Ex: Jantar em Ginza, Shinkansen Tóquio → Kyoto"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Valor Total *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={amount}
                    onChange={(e) => handleAmountChange(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Moeda</label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="BRL">BRL (R$)</option>
                    <option value="JPY">JPY (¥)</option>
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Categoria</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="FOOD">Alimentação & Restaurantes</option>
                    <option value="TRANSPORT">Transporte & Voos</option>
                    <option value="ACCOMMODATION">Hospedagem</option>
                    <option value="TICKETS">Ingressos & Atrações</option>
                    <option value="SHOPPING">Compras & Souvenirs</option>
                    <option value="OTHER">Outros / Serviços</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Data</label>
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Forma de Pagamento</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="CREDIT_CARD">Cartão de Crédito</option>
                    <option value="CASH">Dinheiro / Espécie</option>
                    <option value="DEBIT">Cartão de Débito</option>
                    <option value="PIX">PIX</option>
                    <option value="OTHER">Outro</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Quem pagou?</label>
                  <select
                    value={paidByTravelerId}
                    onChange={(e) => setPaidByTravelerId(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    {data?.travelers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.display_name} {t.role === 'OWNER' ? '(Organizador)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Scope Selection: Shared vs Personal */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Tipo de Despesa (Escopo)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsShared(true);
                      if (selectedTravelers.length === 0 && data?.travelers) {
                        setSelectedTravelers(data.travelers.map((t) => t.id));
                      }
                    }}
                    className={`flex items-center justify-center gap-2 p-2.5 rounded-xl border text-xs font-semibold transition-all ${
                      isShared
                        ? 'bg-indigo-50 border-indigo-500 text-indigo-900 ring-2 ring-indigo-200'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Users className="w-4 h-4 text-indigo-600" />
                    <span>👥 Compartilhada (Grupo)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsShared(false)}
                    className={`flex items-center justify-center gap-2 p-2.5 rounded-xl border text-xs font-semibold transition-all ${
                      !isShared
                        ? 'bg-slate-100 border-slate-500 text-slate-900 ring-2 ring-slate-200'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <User className="w-4 h-4 text-slate-600" />
                    <span>👤 Despesa Individual (Pessoal)</span>
                  </button>
                </div>
              </div>

              {/* ADVANCED SPLIT CALCULATOR (ONLY IF SHARED) */}
              {isShared && (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-200">
                    <div>
                      <span className="text-xs font-bold text-slate-800 uppercase tracking-wide block">
                        Divisão da Conta entre Viajantes
                      </span>
                      <span className="text-[11px] text-slate-500">
                        Selecione quem participa e ajuste as cotas ou valores
                      </span>
                    </div>

                    {/* Quick selection buttons */}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const allIds = (data?.travelers || []).map((t) => t.id);
                          setSelectedTravelers(allIds);
                          initSplitsForTravelers(allIds, parseFloat(amount) || 0);
                        }}
                        className="text-[11px] font-semibold text-indigo-600 hover:underline"
                      >
                        Marcar Grupo Todo
                      </button>
                      <span className="text-slate-300">|</span>
                      <button
                        type="button"
                        onClick={() => setSelectedTravelers([])}
                        className="text-[11px] font-semibold text-slate-500 hover:underline"
                      >
                        Desmarcar
                      </button>
                    </div>
                  </div>

                  {/* Mode Tabs: Por Cotas / Partes vs Por Valores com Distribuição Automática */}
                  <div className="flex items-center gap-2 p-1 bg-white border border-slate-200 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setSplitMode('PARTS')}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                        splitMode === 'PARTS'
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Divide className="w-3.5 h-3.5" />
                      <span>Por Cotas / Partes</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSplitMode('EXACT');
                        rebalanceExactAmounts(
                          parseFloat(amount) || 0,
                          exactAmounts,
                          lockedTravelers,
                          selectedTravelers
                        );
                      }}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                        splitMode === 'EXACT'
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <DollarSign className="w-3.5 h-3.5" />
                      <span>Por Valores (Saldo Automático)</span>
                    </button>
                  </div>

                  {/* Mode explanation */}
                  <div className="text-[11px] text-slate-500 flex items-center justify-between">
                    {splitMode === 'PARTS' ? (
                      <span>
                        💡 Defina o número de cotas de cada um (ex: 6 para você e 3 para os demais = 50% e 25%).
                      </span>
                    ) : (
                      <span>
                        💡 Digite o valor de quem desejar. O saldo restante é rateado igualmente entre os não editados.
                      </span>
                    )}

                    {splitMode === 'EXACT' && (
                      <button
                        type="button"
                        onClick={handleResetEqualShares}
                        className="text-indigo-600 hover:underline flex items-center gap-1 font-semibold text-[11px]"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Redistribuir igualmente
                      </button>
                    )}
                  </div>

                  {/* Travelers List */}
                  <div className="space-y-2">
                    {data?.travelers.map((t) => {
                      const isParticipating = selectedTravelers.includes(t.id);
                      const splitInfo = calculatedSplitsSummary.items.find((it) => it.travelerId === t.id);

                      return (
                        <div
                          key={t.id}
                          className={`p-3 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                            isParticipating
                              ? 'bg-white border-slate-200 shadow-sm'
                              : 'bg-slate-100/60 border-slate-200/60 opacity-60'
                          }`}
                        >
                          {/* Traveler check */}
                          <label className="flex items-center gap-2.5 cursor-pointer shrink-0">
                            <input
                              type="checkbox"
                              checked={isParticipating}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  const updated = [...selectedTravelers, t.id];
                                  setSelectedTravelers(updated);
                                  initSplitsForTravelers(updated, parseFloat(amount) || 0);
                                } else {
                                  const updated = selectedTravelers.filter((id) => id !== t.id);
                                  setSelectedTravelers(updated);
                                  initSplitsForTravelers(updated, parseFloat(amount) || 0);
                                }
                              }}
                              className="rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 w-4 h-4"
                            />
                            <div>
                              <span className="font-semibold text-xs text-slate-900 block">
                                {t.display_name}
                              </span>
                              {t.role === 'OWNER' && (
                                <span className="text-[10px] text-slate-400">Organizador</span>
                              )}
                            </div>
                          </label>

                          {/* Inputs based on Split Mode */}
                          {isParticipating && splitInfo && (
                            <div className="flex items-center gap-3">
                              {splitMode === 'PARTS' ? (
                                /* PARTS / SHARES INPUT */
                                <div className="flex items-center gap-2">
                                  <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1">
                                    <span className="text-[10px] text-slate-400 uppercase font-bold">Cotas:</span>
                                    <input
                                      type="number"
                                      min="0"
                                      step="1"
                                      value={sharesByTraveler[t.id] !== undefined ? sharesByTraveler[t.id] : 1}
                                      onChange={(e) =>
                                        handleEditTravelerParts(t.id, parseInt(e.target.value, 10) || 0)
                                      }
                                      className="w-12 text-xs font-bold text-center bg-transparent focus:outline-none"
                                    />
                                  </div>

                                  <div className="text-right min-w-[70px]">
                                    <span className="text-[10px] text-slate-400 block font-mono">
                                      {splitInfo.percentage.toFixed(1)}%
                                    </span>
                                    <strong className="text-xs font-mono font-bold text-slate-900 block">
                                      {currency} {splitInfo.amount.toFixed(2)}
                                    </strong>
                                  </div>
                                </div>
                              ) : (
                                /* EXACT AMOUNT WITH AUTO REMAINDER */
                                <div className="flex items-center gap-2">
                                  <div className="relative">
                                    <span className="absolute left-2.5 top-1.5 text-[11px] text-slate-400 font-mono">
                                      {currency}
                                    </span>
                                    <input
                                      type="number"
                                      step="0.01"
                                      value={exactAmounts[t.id] !== undefined ? exactAmounts[t.id] : ''}
                                      onChange={(e) => handleEditTravelerExact(t.id, e.target.value)}
                                      className={`w-28 pl-9 pr-2 py-1 text-xs font-mono font-bold border rounded-lg focus:outline-none ${
                                        lockedTravelers[t.id]
                                          ? 'border-indigo-400 bg-indigo-50/40 text-indigo-950'
                                          : 'border-slate-300 bg-white text-slate-800'
                                      }`}
                                    />
                                  </div>

                                  {lockedTravelers[t.id] ? (
                                    <button
                                      type="button"
                                      onClick={() => handleUnlockTraveler(t.id)}
                                      className="p-1 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded"
                                      title="Desbloquear para rateio automático do saldo"
                                    >
                                      <Lock className="w-3.5 h-3.5 text-indigo-600" />
                                    </button>
                                  ) : (
                                    <span
                                      className="p-1 text-slate-300"
                                      title="Calculado automaticamente a partir do saldo restante"
                                    >
                                      <Unlock className="w-3.5 h-3.5" />
                                    </span>
                                  )}

                                  <span className="text-[11px] text-slate-400 font-mono min-w-[42px] text-right">
                                    {splitInfo.percentage.toFixed(1)}%
                                  </span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Summary & Balance Check */}
                  <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-xs">
                    <span className="text-slate-500 font-medium">
                      Soma das partes:
                      <strong className="text-slate-900 ml-1 font-mono">
                        {currency} {calculatedSplitsSummary.totalCalculated.toFixed(2)}
                      </strong>{' '}
                      / {currency} {(parseFloat(amount) || 0).toFixed(2)}
                    </span>

                    {Math.abs(calculatedSplitsSummary.totalCalculated - (parseFloat(amount) || 0)) < 0.05 ? (
                      <span className="text-emerald-700 font-bold flex items-center gap-1 text-[11px]">
                        <Check className="w-3.5 h-3.5 text-emerald-600" /> 100% Distribuído
                      </span>
                    ) : (
                      <span className="text-rose-600 font-bold flex items-center gap-1 text-[11px]">
                        <AlertCircle className="w-3.5 h-3.5" />
                        Diferença: {currency}{' '}
                        {((parseFloat(amount) || 0) - calculatedSplitsSummary.totalCalculated).toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Observações (Opcional)</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Detalhes adicionais, comprovantes ou regras do grupo..."
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-3.5 py-2 text-xs text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-semibold shadow-sm"
                >
                  {editingExpenseId ? 'Salvar Alterações' : 'Registrar Despesa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { Plus, Search, Filter, Compass, Plane, Calendar, MapPin, Sparkles } from 'lucide-react';
import { Trip } from '../types/index.js';
import { api } from '../api/client.js';
import { TripCard } from '../components/TripCard.js';
import { NewTripModal } from '../components/NewTripModal.js';
import { DeleteTripModal } from '../components/DeleteTripModal.js';
import { useAuth } from '../context/AuthContext.js';

export const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [showNewModal, setShowNewModal] = useState(false);
  const [tripToDelete, setTripToDelete] = useState<Trip | null>(null);

  const loadTrips = async () => {
    try {
      setLoading(true);
      const data = await api.trips.list();
      setTrips(data.trips);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTrips();
  }, []);

  const filteredTrips = trips.filter((t) => {
    const matchesSearch =
      t.title.toLowerCase().includes(search.toLowerCase()) ||
      (t.destination_summary && t.destination_summary.toLowerCase().includes(search.toLowerCase())) ||
      (t.primary_country && t.primary_country.toLowerCase().includes(search.toLowerCase()));

    const matchesStatus = statusFilter === 'ALL' || t.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Hero Welcome Banner */}
      <div className="relative rounded-3xl overflow-hidden bg-gradient-to-r from-slate-900 via-slate-800 to-brand-950 text-white p-6 sm:p-10 shadow-xl">
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-white/10 backdrop-blur-md border border-white/15 text-brand-200 mb-4">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Sistema Trips • Dossiê Editorial & Roteiro</span>
          </div>

          <h1 className="text-2xl sm:text-4xl font-bold font-serif tracking-tight leading-tight">
            Olá, {user?.name?.split(' ')[0]}! Para onde vamos a seguir?
          </h1>
          <p className="mt-2 text-sm text-slate-300 leading-relaxed">
            Organize suas viagens com extração inteligente de documentos por IA, reservas detalhadas, roteiros ilustrados e gere dossiês completos em PDF (Trip Book).
          </p>

          <div className="mt-6 flex items-center gap-3">
            <button
              onClick={() => setShowNewModal(true)}
              className="px-5 py-2.5 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-brand-600/30 transition-all flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Planejar Nova Viagem
            </button>
          </div>
        </div>

        {/* Ambient subtle decoration */}
        <div className="absolute right-0 bottom-0 opacity-10 pointer-events-none translate-x-12 translate-y-12">
          <Plane className="w-96 h-96 -rotate-45" />
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por destino, país ou título..."
            className="w-full pl-10 pr-4 py-2 text-xs border border-slate-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 shadow-sm"
          />
        </div>

        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
          {[
            { id: 'ALL', label: 'Todas' },
            { id: 'PLANNING', label: 'Planejamento' },
            { id: 'CONFIRMED', label: 'Confirmadas' },
            { id: 'IN_PROGRESS', label: 'Em Andamento' },
            { id: 'COMPLETED', label: 'Concluídas' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                statusFilter === tab.id
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Trips Grid */}
      {loading ? (
        <div className="py-24 text-center text-slate-400 text-sm">Carregando viagens...</div>
      ) : filteredTrips.length === 0 ? (
        <div className="py-20 text-center bg-white rounded-3xl border border-slate-200 p-8 shadow-sm">
          <Compass className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-800">Nenhuma viagem encontrada</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-5">
            {search ? 'Nenhum resultado com o termo pesquisado.' : 'Comece cadastrando sua primeira viagem ao sistema.'}
          </p>
          <button
            onClick={() => setShowNewModal(true)}
            className="px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold shadow-sm"
          >
            Cadastrar Nova Viagem
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTrips.map((trip) => (
            <TripCard
              key={trip.id}
              trip={trip}
              canManage={trip.user_role === 'OWNER' || user?.role === 'ADMIN'}
              onDelete={(t) => setTripToDelete(t)}
            />
          ))}
        </div>
      )}

      {/* New Trip Modal */}
      {showNewModal && (
        <NewTripModal
          onSuccess={() => {
            setShowNewModal(false);
            loadTrips();
          }}
          onClose={() => setShowNewModal(false)}
        />
      )}

      {/* Delete Trip Confirmation Modal */}
      <DeleteTripModal
        trip={tripToDelete}
        isOpen={!!tripToDelete}
        onClose={() => setTripToDelete(null)}
        onSuccess={() => {
          setTripToDelete(null);
          loadTrips();
        }}
      />
    </div>
  );
};
